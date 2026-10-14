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
Copy-Item terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edite únicamente el nombre globalmente único del bucket.
terraform -chdir=terraform plan -var-file=terraform.tfvars
```

El estado local no se versiona. Para un equipo, cree previamente un bucket
dedicado de estado con retención/versionado y use un backend GCS. No reutilice
el bucket de resultados. La creación del bucket de estado queda fuera de esta
configuración para no generar un ciclo de bootstrap.

## Aplicar y verificar

La aplicación requiere aprobación explícita y no se ejecuta en cada push:

```powershell
terraform -chdir=terraform apply -var-file=terraform.tfvars
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

El proveedor WIF debe restringir el repositorio y la rama. La cuenta necesita,
como mínimo, `roles/storage.admin` para el bucket de Terraform, `roles/
serviceusage.serviceUsageAdmin` si habilita APIs, `roles/artifactregistry.writer`
para publicar la imagen, `roles/container.developer` para el despliegue GKE,
`roles/container.clusterViewer` para obtener credenciales y permisos de
Terraform sobre los recursos que se vayan a administrar. Para el bucket, la
cuenta de Cloud Run existente recibe únicamente `roles/storage.objectUser`.

## Destrucción segura

Primero revise el estado y el plan de destrucción:

```powershell
terraform -chdir=terraform plan -destroy -var-file=terraform.tfvars
terraform -chdir=terraform destroy -var-file=terraform.tfvars
```

Esta configuración solo puede destruir el bucket de resultados y su IAM
administrado. `force_destroy = false` evita borrar objetos silenciosamente;
vacíe el bucket de forma consciente antes de destruirlo. No ejecute comandos
`gcloud` de borrado sobre el proyecto, GKE, Cloud SQL, Pub/Sub, Cloud Run,
Artifact Registry o Secret Manager.

## Recursos existentes e importación manual

Actualmente se usan `data sources` para mantenerlos fuera del estado. Si se
aprueba formalmente que Terraform los administre, debe comprobarse primero su
identidad, añadir un bloque `resource` equivalente y ejecutar manualmente el
import correspondiente (`terraform import`). Nunca se importa o modifica un
recurso automáticamente desde CI.

## Costos y límites

El bucket tiene versionado y elimina objetos de más de 30 días; el versionado
puede aumentar almacenamiento. Cloud SQL, GKE, Cloud Run, Artifact Registry,
Pub/Sub y Secret Manager ya existentes pueden generar costos independientes.
No se crean nodos, una base de datos adicional, un segundo clúster ni un
segundo servicio Cloud Run.
