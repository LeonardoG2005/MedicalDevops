# Terraform en Google Cloud

Esta configuración administra únicamente recursos propios de esta entrega y
referencia los recursos de producción que ya fueron comprobados en GCP. No
crea un segundo GKE, Cloud SQL, Cloud Run, tópico, suscripción ni repositorio
de Artifact Registry.

## Alcance comprobado

| Servicio | Recurso | Tratamiento |
| --- | --- | --- |
| Cloud SQL for PostgreSQL | `medical-devops-db` / `medical_devops` | `data source`, existente |
| GKE | `medical-devops-gke` | `data source`, existente |
| Artifact Registry | `medical-api` | `data source`, existente |
| Cloud Run | `medical-orchestrator` | fuera del estado; se conserva el `cloudbuild.yaml` |
| Pub/Sub | `medical-orchestrator-events` y DLQ | `data source`, existentes |
| Secret Manager | secretos de la API | `data source`; nunca se leen valores |
| Cloud Storage | bucket de resultados | **creado y administrado por Terraform** |

Así se cumplen los servicios de plataforma necesarios sin duplicar recursos
compartidos. La base de datos real de producción es Cloud SQL PostgreSQL,
confirmada por el manifiesto de Kubernetes y por GCP. El proxy usa
`medical-devops-db`; `DATABASE_URL` permanece en Secret Manager.

## Prerrequisitos y autenticación

- Terraform >= 1.6 (probado con 1.16.x).
- Google Cloud CLI autenticado y proyecto seleccionado.
- APIs habilitadas o permiso `serviceusage.services.enable`.
- Permisos para leer Cloud SQL, GKE, Artifact Registry, Pub/Sub y Secret
  Manager, y para administrar Storage.

Para desarrollo local:

```powershell
gcloud auth application-default login
gcloud config set project project-40fc41d1-6899-4ce0-9ef
```

No se guardan contraseñas, tokens, `DATABASE_URL`, credenciales JSON ni
valores de secretos en Terraform. El archivo `terraform.tfvars` local no debe
subirse al repositorio.

## Inicializar, validar y planificar

Desde la raíz del repositorio:

```powershell
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform fmt -check
terraform -chdir=terraform validate
terraform -chdir=terraform plan
```

El nombre predeterminado del bucket de resultados es
`medical-devops-400345348270-results`, que coincide con el recurso del estado
remoto usado en esta entrega. Si se cambia, debe mantenerse el mismo valor en
todos los entornos; no use un `terraform.tfvars` local diferente al del
pipeline.

El estado local no se versiona. El workflow de aplicación usa un backend GCS,
por lo que debe crear previamente un bucket dedicado de estado. No reutilice
el bucket de resultados. La creación del bucket de estado queda fuera de esta
configuración para no generar un ciclo de bootstrap:

```powershell
gcloud storage buckets create gs://NOMBRE_UNICO_DEL_BUCKET_DE_ESTADO `
  --project=project-40fc41d1-6899-4ce0-9ef `
  --location=us-central1 `
  --uniform-bucket-level-access
gcloud storage buckets update gs://NOMBRE_UNICO_DEL_BUCKET_DE_ESTADO `
  --versioning
```

Configure ese nombre como el secret `TF_STATE_BUCKET` de GitHub. El workflow
usa el prefijo `medicaldevops/terraform`; así el estado persiste entre runs y
no se guarda en el repositorio.

Para consultar el mismo estado remoto desde el equipo local:

```powershell
terraform -chdir=terraform init -reconfigure `
  -backend-config="bucket=NOMBRE_DEL_BUCKET_DE_ESTADO" `
  -backend-config="prefix=medicaldevops/terraform"
terraform -chdir=terraform plan -lock-timeout=5m
```

## Aplicar y verificar

La aplicación requiere aprobación explícita y no se ejecuta en cada push:

```powershell
terraform -chdir=terraform apply
terraform -chdir=terraform output
gcloud storage ls gs://NOMBRE_DEL_BUCKET
```

Antes de aplicar, revise que el plan solo incluya el bucket de resultados,
su permiso IAM y, si faltan, la habilitación de APIs. Si propone crear Cloud
SQL, GKE, Pub/Sub, Cloud Run o Artifact Registry, deténgase: la configuración
o las identidades no coinciden con la infraestructura comprobada.

## API y Orchestrator

El workflow `terraform-gcp.yaml` valida los pushes a `feature/terraform` y
`main`. Cuando la validación termina correctamente después de un push a
`main`, el job `apply-and-deploy` continúa automáticamente, sin
`workflow_dispatch`, sin input manual y sin esperar aprobación de un
environment. La etapa aplica Terraform, publica la imagen de la API y
despliega los manifiestos existentes en el GKE existente. El Orchestrator
conserva su despliegue independiente mediante `orchestrator/cloudbuild.yaml`.

Los pushes a `feature/terraform` ejecutan únicamente validación y pruebas.
El despliegue automático está limitado a `main` para evitar desplegar cambios
experimentales antes del merge.

Secretos de GitHub necesarios:

- `GCP_WIF_PROVIDER`: el nombre completo del proveedor WIF existente.
- `GCP_DEPLOYER_SERVICE_ACCOUNT`: normalmente
  `github-actions-deployer@project-40fc41d1-6899-4ce0-9ef.iam.gserviceaccount.com`.
- `TF_STATE_BUCKET`: nombre del bucket GCS dedicado para el estado remoto,
  sin el prefijo `gs://`.

El proveedor WIF debe restringir el repositorio y la rama. Para corregir los
`403` del pipeline, un administrador debe conceder a la cuenta federada estos
permisos de proyecto:

```powershell
$project = "project-40fc41d1-6899-4ce0-9ef"
$sa = "github-actions-deployer@project-40fc41d1-6899-4ce0-9ef.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/browser"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/serviceusage.serviceUsageAdmin"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/cloudsql.viewer"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/pubsub.viewer"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/secretmanager.viewer"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/artifactregistry.reader"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/container.clusterViewer"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/iam.serviceAccountViewer"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/storage.admin"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding $project --member="serviceAccount:$sa" --role="roles/container.developer"
```

También debe estar habilitada `cloudresourcemanager.googleapis.com` en el
proyecto. `roles/storage.admin` es necesario para el bucket administrado y el
backend; `roles/artifactregistry.writer` publica la imagen; y
`roles/container.developer` despliega en GKE. Para el bucket de resultados, la
cuenta de Cloud Run existente recibe únicamente `roles/storage.objectUser`.

El workflow no declara un environment protegido para el despliegue automático.
Por ello, después de un push a `main`, no aparecerá una solicitud de
autorización en GitHub Actions: el deploy continuará automáticamente si
`validate` pasa. La protección principal queda en la revisión y merge del pull
request hacia `main`.

## Destrucción segura

Primero revise el estado y el plan de destrucción:

```powershell
terraform -chdir=terraform plan -destroy
terraform -chdir=terraform destroy
```

Esta configuración puede destruir los recursos declarados como `resource`,
incluidos la base de datos lógica, Artifact Registry, Pub/Sub y el bucket de
resultados. `force_destroy = false` evita borrar objetos silenciosamente;
vacíe los buckets de forma consciente antes de destruirlos. Los recursos
consultados con `data` (GKE, Cloud Run, Secret Manager e instancia de Cloud
SQL) no se destruyen porque no forman parte del estado administrado.

Para demostrar el ciclo completo de la entrega:

```powershell
terraform -chdir=terraform plan -destroy
terraform -chdir=terraform destroy
```

Antes, compruebe que los buckets no tengan objetos y guarde las evidencias
necesarias. El destroy elimina la base de datos lógica, el repositorio de
imágenes, el tópico, la suscripción, el bucket de resultados, su IAM y las
APIs administradas por esta configuración. No elimina la instancia completa
de Cloud SQL, GKE, Cloud Run, Secret Manager ni el bucket remoto de estado.

Después puede recrear los recursos administrados con:

```powershell
terraform -chdir=terraform apply
```

La recreación no restaura imágenes Docker, datos anteriores de la base de
datos ni secretos. El pipeline despliega la imagen y ejecuta
`npm run db:migrate` dentro del pod nuevo después del rollout, usando el
`DATABASE_URL` sincronizado desde Secret Manager. Si se ejecuta `apply`
manualmente fuera del pipeline, publique la imagen, despliegue Kubernetes y
ejecute esa migración desde un pod antes de probar los endpoints.

## Recursos existentes e importación manual

Actualmente se usan `data sources` para mantenerlos fuera del estado. Si se
aprueba formalmente que Terraform los administre, debe comprobarse primero su
identidad, añadir un bloque `resource` equivalente y ejecutar manualmente el
import correspondiente (`terraform import`). Nunca se importa o modifica un
recurso automáticamente desde CI.

## Por qué no se borran los recursos existentes

El repositorio de referencia administra una infraestructura nueva de AWS
(VPC, RDS, ECS, ECR, ALB, CloudWatch y Secrets Manager). En este proyecto los
servicios equivalentes de GCP ya están en uso por la API y el Orchestrator.
Borrarlos para recrearlos introduciría una interrupción y no aporta valor
académico adicional. La alternativa correcta en Terraform es adoptarlos:

1. comprobar la identidad exacta del recurso;
2. declarar un bloque `resource` con su configuración real;
3. ejecutar `terraform import` manualmente;
4. revisar que `terraform plan` no proponga cambios destructivos;
5. solo después permitir el pipeline.

La configuración mantiene GKE, Cloud Run, Secret Manager, la instancia de
Cloud SQL y la DLQ de Pub/Sub como `data sources`. Artifact Registry, la base
de datos lógica de Cloud SQL, el tópico Pub/Sub y su suscripción están
declarados como `resource`. El bucket de resultados también es un recurso
creado por Terraform y el estado remoto existe en GCS. No se consultan como
`data` los recursos administrados, porque deben poder recrearse después de un
`terraform destroy`.

Los comandos de adopción, después de revisar la identidad, son:

```powershell
terraform -chdir=terraform import `
  google_artifact_registry_repository.api `
  projects/project-40fc41d1-6899-4ce0-9ef/locations/us-central1/repositories/medical-api

terraform -chdir=terraform import `
  google_sql_database.application `
  project-40fc41d1-6899-4ce0-9ef/medical-devops-db/medical_devops

terraform -chdir=terraform import `
  google_pubsub_topic.events `
  projects/project-40fc41d1-6899-4ce0-9ef/topics/medical-orchestrator-events

terraform -chdir=terraform import `
  google_pubsub_subscription.events `
  projects/project-40fc41d1-6899-4ce0-9ef/subscriptions/medical-orchestrator-events-sub
```

Después de importar, ejecute `terraform plan` y no continúe si propone
destruir o cambiar datos antes de la demostración. Estos recursos se pueden
destruir durante el ejercicio porque se retiró `prevent_destroy`; el objetivo
es demostrar el ciclo completo y recrearlos después. No se importa el clúster
GKE ni la instancia completa de Cloud SQL.

## Costos y límites

El bucket tiene versionado y elimina objetos de más de 30 días; el versionado
puede aumentar almacenamiento. Cloud SQL, GKE, Cloud Run, Artifact Registry,
Pub/Sub y Secret Manager ya existentes pueden generar costos independientes.
No se crean nodos, una base de datos adicional, un segundo clúster ni un
segundo servicio Cloud Run.
