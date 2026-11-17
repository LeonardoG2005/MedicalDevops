# Game day de Ingenieria del Caos de Seguridad (defensa en profundidad).
# Todo lo que los experimentos 1 (identidad de maquina del coordinador) y 4
# (resiliencia de los datos del flujo) necesitan en GCP:
# - bitacoras de auditoria de acceso a datos (sin ellas no hay deteccion),
# - metricas de log (deteccion como codigo, ver chaos/security/detecciones),
# - alertas con sus umbrales,
# - honeytoken (secreto senuelo),
# - minimo privilegio del coordinador sobre el bucket y copia aislada.

variable "ventana_latido_segundos" {
  description = "Minutos sin bitacora de la API antes de alertar por ausencia de senal."
  type        = number
  default     = 600
}

locals {
  contenedor_api = "resource.type=\"k8s_container\" AND resource.labels.cluster_name=\"${var.gke_cluster_name}\" AND resource.labels.namespace_name=\"${var.gke_namespace}\" AND resource.labels.container_name=\"medical-documents-api\""
  api_gsa_email  = data.google_service_account.api.email
  bucket_copia   = "${local.results_bucket}-copia-aislada"

  # Las reglas: el mismo filtro vive en chaos/security/detecciones/*.json con
  # sus casos positivos y negativos; aqui solo se publica en Cloud Logging.
  detecciones = {
    chaos_acceso_rechazado = {
      descripcion = "Llamadas al interruptor de caos rechazadas por token invalido, vencido, estatico, de otra audiencia o fuera de la ventana"
      filtro      = "${local.contenedor_api} AND jsonPayload.evento=\"chaos_acceso_rechazado\""
      etiquetas   = { motivo = "EXTRACT(jsonPayload.motivo)", agente = "EXTRACT(jsonPayload.agente)" }
    }
    chaos_acceso_origen_no_previsto = {
      descripcion = "Acceso aceptado al interruptor desde un agente de usuario que no es el de la plataforma de caos (node, k6, curl del runner)"
      filtro      = "${local.contenedor_api} AND jsonPayload.evento=\"chaos_acceso\" AND NOT jsonPayload.agente=~\"^(node|undici|k6-medical-chaos|curl)\""
      etiquetas   = { agente = "EXTRACT(jsonPayload.agente)", tipo_token = "EXTRACT(jsonPayload.tipo_token)" }
    }
    identidad_coordinador_impersonada = {
      descripcion = "La identidad del coordinador (medical-api-gsa) usada por suplantacion o con una llave estatica, no desde Workload Identity"
      # Workload Identity tambien deja serviceAccountDelegationInfo (sujeto
      # <proyecto>.svc.id.goog[default/medical-api]); ese es el uso legitimo y
      # se excluye. Sin esta exclusion la regla disparaba con cada escritura en
      # GCS, cada conexion a Cloud SQL y cada lectura de secretos de los pods.
      filtro    = "protoPayload.authenticationInfo.principalEmail=\"${local.api_gsa_email}\" AND NOT protoPayload.authenticationInfo.serviceAccountDelegationInfo.principalSubject=\"${local.sujeto_wi}\" AND (protoPayload.authenticationInfo.serviceAccountDelegationInfo:* OR protoPayload.authenticationInfo.serviceAccountKeyName:*)"
      etiquetas = { metodo = "EXTRACT(protoPayload.methodName)", ip = "EXTRACT(protoPayload.requestMetadata.callerIp)" }
    }
    honeytoken_tocado = {
      descripcion = "Alguien leyo el secreto senuelo medical-api-admin-backup-key, que ningun componente legitimo usa"
      filtro      = "protoPayload.methodName=\"google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion\" AND protoPayload.resourceName:\"secrets/medical-api-admin-backup-key\""
      etiquetas   = { principal = "EXTRACT(protoPayload.authenticationInfo.principalEmail)", ip = "EXTRACT(protoPayload.requestMetadata.callerIp)" }
    }
    objetos_flujo_borrados = {
      descripcion = "Borrado o sobrescritura de objetos del flujo en el bucket de resultados"
      filtro      = "resource.type=\"gcs_bucket\" AND resource.labels.bucket_name=\"${local.results_bucket}\" AND (protoPayload.methodName=\"storage.objects.delete\" OR protoPayload.methodName=\"storage.objects.update\" OR protoPayload.methodName=\"storage.objects.rewrite\")"
      etiquetas   = { principal = "EXTRACT(protoPayload.authenticationInfo.principalEmail)", metodo = "EXTRACT(protoPayload.methodName)" }
    }
    latido_api = {
      descripcion = "Latido de telemetria: cualquier peticion registrada por la API (su ausencia dispara la alerta de telemetria)"
      filtro      = "${local.contenedor_api} AND jsonPayload.msg=\"request completed\""
      etiquetas   = {}
    }
  }

  # Cada metrica de log escribe sus series sobre el recurso monitoreado de la
  # entrada que la origino; la condicion PromQL debe nombrarlo
  # (monitored_resource). Tipos comprobados con datos reales el 2026-11-17.
  alertas = {
    chaos_acceso_rechazado            = { recursos = ["k8s_container"], umbral = 5, severidad = "WARNING", texto = "Mas de 5 rechazos del interruptor de caos en 5 minutos: alguien prueba credenciales o las usa fuera de la ventana. Revisar jsonPayload.motivo y jsonPayload.ip." }
    chaos_acceso_origen_no_previsto   = { recursos = ["k8s_container"], umbral = 0, severidad = "CRITICAL", texto = "El interruptor de caos acepto una llamada desde un agente no previsto: posible token filtrado. Contencion: workflow security-remediate.yml (rota el token con aprobacion humana)." }
    identidad_coordinador_impersonada = { recursos = ["audited_resource", "gcs_bucket", "cloudsql_database"], umbral = 0, severidad = "CRITICAL", texto = "La identidad del coordinador se uso por suplantacion o con llave estatica. Contencion: revisar quien tiene iam.serviceAccountTokenCreator y revocarlo; verificar que no existan llaves." }
    honeytoken_tocado                 = { recursos = ["audited_resource"], umbral = 0, severidad = "CRITICAL", texto = "Honeytoken tocado: el secreto senuelo no lo usa nadie legitimo. Tratar como intrusion confirmada y seguir el playbook del game day." }
    objetos_flujo_borrados            = { recursos = ["gcs_bucket"], umbral = 0, severidad = "CRITICAL", texto = "Objetos del flujo borrados o sobrescritos. Restaurar desde versiones o desde la copia aislada (chaos/security/exp4-datos)." }
  }

  sujeto_wi = "serviceAccount:${var.project_id}.svc.id.goog[${var.gke_namespace}/medical-api]"
}

# Sin bitacoras de acceso a datos, leer un secreto o borrar un objeto no deja
# rastro: la cobertura de telemetria de las capas de identidad y datos empieza aqui.
#
# Cambiar la configuracion de auditoria exige resourcemanager.projects.setIamPolicy
# sobre todo el proyecto. La cuenta de CI (github-actions-deployer) no lo tiene a
# proposito: con ese permiso podria darse a si misma el rol de owner (escalada
# de privilegios). Por minimo privilegio la auditoria la activa el dueno del
# proyecto una sola vez (hecho a mano el 2026-11-16, ver terraform/README.md) y
# CI no la gestiona. Quien aplique Terraform con una cuenta de owner puede
# pasar gestionar_auditoria=true para declararla como codigo.
variable "gestionar_auditoria" {
  description = "Gestionar con Terraform la auditoria de acceso a datos (requiere setIamPolicy sobre el proyecto)."
  type        = bool
  default     = false
}

resource "google_project_iam_audit_config" "secretmanager" {
  count   = var.gestionar_auditoria ? 1 : 0
  project = var.project_id
  service = "secretmanager.googleapis.com"
  audit_log_config { log_type = "DATA_READ" }
  audit_log_config { log_type = "DATA_WRITE" }
}

resource "google_project_iam_audit_config" "storage" {
  count   = var.gestionar_auditoria ? 1 : 0
  project = var.project_id
  service = "storage.googleapis.com"
  audit_log_config { log_type = "DATA_WRITE" }
}

# Recursos creados a mano durante el game day del 2026-11-16 (antes de que CI
# los aplicara). Los bloques import hacen que Terraform los adopte en vez de
# fallar con 409 "already exists".
import {
  to = google_secret_manager_secret.honeytoken
  id = "projects/${var.project_id}/secrets/medical-api-admin-backup-key"
}

import {
  for_each = local.detecciones
  to       = google_logging_metric.seguridad[each.key]
  id       = "seguridad_${each.key}"
}

import {
  to = google_storage_bucket.copia_aislada
  id = local.bucket_copia
}

# Honeytoken: un secreto con nombre apetecible que ningun componente lee. El
# valor es un senuelo (no protege nada); lo que importa es la alerta al tocarlo.
resource "google_secret_manager_secret" "honeytoken" {
  secret_id = "medical-api-admin-backup-key"
  project   = var.project_id
  replication {
    auto {}
  }
  labels     = { release = "v5", uso = "honeytoken" }
  depends_on = [google_project_service.required]
}

# El VALOR del senuelo no lo gestiona Terraform. Cada plan o apply refresca una
# secret_version leyendo su contenido (AccessSecretVersion), que es justo la
# senal del honeytoken: el CI disparaba la alerta en cada corrida (visto en la
# auditoria del 2026-11-17, lecturas de github-actions-deployer con agente
# Terraform). La version 1 se creo a mano y queda en GCP; este bloque solo la
# saca del estado sin borrarla. El secreto (metadatos) si sigue en Terraform:
# leer metadatos es GetSecret, no AccessSecretVersion.
removed {
  from = google_secret_manager_secret_version.honeytoken
  lifecycle {
    destroy = false
  }
}

resource "google_logging_metric" "seguridad" {
  for_each    = local.detecciones
  name        = "seguridad_${each.key}"
  project     = var.project_id
  description = each.value.descripcion
  filter      = each.value.filtro

  # Contador simple, sin etiquetas: las metricas se crearon asi a mano el dia
  # del game day y el proveedor trata agregar etiquetas como reemplazo (borraria
  # su serie historica, que es evidencia). El detalle para el triage (motivo,
  # agente, ip, principal) esta en la propia entrada de log; "etiquetas" queda
  # documentado en locals para cuando se cree desde cero.
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_monitoring_alert_policy" "seguridad" {
  for_each     = local.alertas
  display_name = "Seguridad: ${replace(each.key, "_", " ")}"
  combiner     = "OR"
  severity     = each.value.severidad

  # PromQL, igual que alertas.tf y chaos.tf. Un filtro "metric.type=..." sin
  # restringir resource.type lo rechaza la API (error 400 del apply del
  # 2026-11-17); aqui cada selector nombra su monitored_resource.
  conditions {
    display_name = "seguridad_${each.key} en 5 minutos"
    condition_prometheus_query_language {
      query = format("sum(%s) > %d", join(" or ", [
        for r in each.value.recursos :
        "increase(logging_googleapis_com:user_${google_logging_metric.seguridad[each.key].name}{monitored_resource=\"${r}\"}[5m])"
      ]), each.value.umbral)
      duration            = "0s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = var.canal_notificacion_id == "" ? [] : [var.canal_notificacion_id]
  documentation {
    mime_type = "text/markdown"
    content   = each.value.texto
  }
  depends_on = [google_project_service.required]
}

# Alerta por ausencia de senal: si la API deja de escribir bitacora (exportador
# detenido, pods caidos, bitacora truncada) durante la ventana, dispara.
resource "google_monitoring_alert_policy" "latido_telemetria" {
  display_name = "Seguridad: ausencia de latido de telemetria de la API"
  combiner     = "OR"
  severity     = "CRITICAL"

  conditions {
    display_name = "sin bitacora de la API durante ${var.ventana_latido_segundos} s"
    condition_prometheus_query_language {
      query               = "absent_over_time(logging_googleapis_com:user_${google_logging_metric.seguridad["latido_api"].name}{monitored_resource=\"k8s_container\"}[${var.ventana_latido_segundos}s])"
      duration            = "0s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = var.canal_notificacion_id == "" ? [] : [var.canal_notificacion_id]
  documentation {
    mime_type = "text/markdown"
    content   = "La API no escribe bitacora desde hace mas de ${var.ventana_latido_segundos} s. O se detuvo el exportador, o los pods, o alguien trunco la bitacora. Verificar kubectl logs y el estado del PodMonitoring."
  }
  depends_on = [google_project_service.required]
}

# Minimo privilegio del coordinador sobre los datos del flujo: puede crear
# objetos, no leerlos ni borrarlos. Una credencial robada del coordinador no
# sirve para destruir el archivo.
resource "google_storage_bucket_iam_member" "api_escribe_flujo" {
  bucket = google_storage_bucket.workflow_results.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${local.api_gsa_email}"
}

# Copia aislada: otra region, otra politica de acceso (solo el desplegador la
# escribe por el workflow de respaldo), retencion propia. El coordinador y su
# identidad no tienen ningun permiso sobre ella.
resource "google_storage_bucket" "copia_aislada" {
  name                        = local.bucket_copia
  location                    = "us-east1"
  project                     = var.project_id
  uniform_bucket_level_access = true
  force_destroy               = false
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Bloqueada (WORM real): nadie, ni el dueno del proyecto, puede acortarla ni
  # quitarla, y ningun objeto se borra o sobrescribe antes de 7 dias. Se bloqueo
  # el 2026-11-16 durante el experimento 4 (el borrado devolvio 403).
  retention_policy {
    retention_period = 7 * 86400
    is_locked        = true
  }

  labels = {
    application = "medical-devops"
    environment = var.environment
    managed_by  = "terraform"
    uso         = "copia-aislada"
  }
}

data "google_service_account" "deployer" {
  account_id = "github-actions-deployer"
  project    = var.project_id
}

resource "google_storage_bucket_iam_member" "copia_escribe_desplegador" {
  bucket = google_storage_bucket.copia_aislada.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${data.google_service_account.deployer.email}"
}

output "bucket_copia_aislada" {
  value = google_storage_bucket.copia_aislada.name
}

output "honeytoken" {
  value = google_secret_manager_secret.honeytoken.secret_id
}
