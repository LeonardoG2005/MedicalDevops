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

El workflow `terraform-gcp.yaml` valida en pushes a `feature/terraform` y
solo despliega tras ejecutar manualmente `workflow_dispatch` y aprobar el
environment protegido `terraform-apply`. La etapa de aplicación de Terraform
es independiente de la publicación de la imagen. La imagen de la API se
publica en el Artifact Registry existente y se despliegan los manifiestos
existentes en el GKE existente. El Orchestrator conserva su despliegue
independiente mediante `orchestrator/cloudbuild.yaml`.

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

El workflow declara `environment: terraform-apply`. En un repositorio privado,
la opción **Required reviewers** depende del plan de GitHub; si no aparece en
la configuración del environment, GitHub no puede proporcionar esa aprobación
manual con el plan actual. En ese caso, conserva `apply_infrastructure` en
`false` para las ejecuciones normales y ejecuta el despliegue únicamente desde
`workflow_dispatch` después de revisar el plan. Para tener una aprobación
forzada por GitHub, se necesita un plan que habilite reglas de protección para
environments en repositorios privados.

## Destrucción segura

Primero revise el estado y el plan de destrucción:

```powershell
terraform -chdir=terraform plan -destroy
terraform -chdir=terraform destroy
```

Esta configuración solo puede destruir el bucket de resultados y su IAM
administrado. `force_destroy = false` evita borrar objetos silenciosamente;
vacíe el bucket de forma consciente antes de destruirlo. No ejecute comandos
`gcloud` de borrado sobre el proyecto, GKE, Cloud SQL, Pub/Sub, Cloud Run,
Artifact Registry o Secret Manager.

Los recursos existentes adoptados tienen `prevent_destroy = true`; por eso un
destroy total se detiene en lugar de borrar la base de datos, Artifact
Registry, tópico o suscripción. Para demostrar el ciclo de destrucción sin
tocar esos recursos, use únicamente el bucket de resultados:

```powershell
terraform -chdir=terraform plan -destroy `
  -target=google_storage_bucket_iam_member.orchestrator_writer[0] `
  -target=google_storage_bucket.workflow_results
terraform -chdir=terraform destroy `
  -target=google_storage_bucket_iam_member.orchestrator_writer[0] `
  -target=google_storage_bucket.workflow_results
```

Antes, compruebe que el bucket no tenga objetos. Después puede recrearlo con
`terraform apply`; el backend remoto, GKE, Cloud SQL, Pub/Sub, Cloud Run y
Artifact Registry permanecen intactos.

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

La configuración mantiene GKE, Cloud Run y Secret Manager como `data sources`.
Artifact Registry, la base de datos lógica de Cloud SQL, el tópico Pub/Sub y
su suscripción ya están declarados como `resource` y deben importarse una vez
al estado remoto. El bucket de resultados sí es un recurso creado por
Terraform y el estado remoto ya existe en GCS.

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
destruir o cambiar datos. No se importa el clúster GKE ni la instancia
completa de Cloud SQL sin comparar toda su configuración.

## Costos y límites

El bucket tiene versionado y elimina objetos de más de 30 días; el versionado
puede aumentar almacenamiento. Cloud SQL, GKE, Cloud Run, Artifact Registry,
Pub/Sub y Secret Manager ya existentes pueden generar costos independientes.
No se crean nodos, una base de datos adicional, un segundo clúster ni un
segundo servicio Cloud Run.
