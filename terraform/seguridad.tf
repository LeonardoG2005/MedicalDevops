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
      filtro      = "protoPayload.authenticationInfo.principalEmail=\"${local.api_gsa_email}\" AND (protoPayload.authenticationInfo.serviceAccountDelegationInfo:* OR protoPayload.authenticationInfo.serviceAccountKeyName:*)"
      etiquetas   = { metodo = "EXTRACT(protoPayload.methodName)", ip = "EXTRACT(protoPayload.requestMetadata.callerIp)" }
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

  alertas = {
    chaos_acceso_rechazado            = { umbral = 5, duracion = "0s", severidad = "WARNING", texto = "Mas de 5 rechazos del interruptor de caos en 5 minutos: alguien prueba credenciales o las usa fuera de la ventana. Revisar jsonPayload.motivo y jsonPayload.ip." }
    chaos_acceso_origen_no_previsto   = { umbral = 0, duracion = "0s", severidad = "CRITICAL", texto = "El interruptor de caos acepto una llamada desde un agente no previsto: posible token filtrado. Contencion: workflow security-remediate.yml (rota el token con aprobacion humana)." }
    identidad_coordinador_impersonada = { umbral = 0, duracion = "0s", severidad = "CRITICAL", texto = "La identidad del coordinador se uso por suplantacion o con llave estatica. Contencion: revisar quien tiene iam.serviceAccountTokenCreator y revocarlo; verificar que no existan llaves." }
    honeytoken_tocado                 = { umbral = 0, duracion = "0s", severidad = "CRITICAL", texto = "Honeytoken tocado: el secreto senuelo no lo usa nadie legitimo. Tratar como intrusion confirmada y seguir el playbook del game day." }
    objetos_flujo_borrados            = { umbral = 0, duracion = "0s", severidad = "CRITICAL", texto = "Objetos del flujo borrados o sobrescritos. Restaurar desde versiones o desde la copia aislada (chaos/security/exp4-datos)." }
  }
}

# Sin bitacoras de acceso a datos, leer un secreto o borrar un objeto no deja
# rastro: la cobertura de telemetria de las capas de identidad y datos empieza aqui.
resource "google_project_iam_audit_config" "secretmanager" {
  project = var.project_id
  service = "secretmanager.googleapis.com"
  audit_log_config { log_type = "DATA_READ" }
  audit_log_config { log_type = "DATA_WRITE" }
}

resource "google_project_iam_audit_config" "storage" {
  project = var.project_id
  service = "storage.googleapis.com"
  audit_log_config { log_type = "DATA_WRITE" }
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

resource "google_secret_manager_secret_version" "honeytoken" {
  secret      = google_secret_manager_secret.honeytoken.id
  secret_data = "decoy-${data.google_project.current.number}-this-key-is-a-honeytoken-do-not-use"
}

resource "google_logging_metric" "seguridad" {
  for_each    = local.detecciones
  name        = "seguridad_${each.key}"
  project     = var.project_id
  description = each.value.descripcion
  filter      = each.value.filtro

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    dynamic "labels" {
      for_each = each.value.etiquetas
      content {
        key        = labels.key
        value_type = "STRING"
      }
    }
  }
  label_extractors = each.value.etiquetas
}

resource "google_monitoring_alert_policy" "seguridad" {
  for_each     = local.alertas
  display_name = "Seguridad: ${replace(each.key, "_", " ")}"
  combiner     = "OR"
  severity     = each.value.severidad

  conditions {
    display_name = "seguridad_${each.key} en 5 minutos"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.seguridad[each.key].name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.umbral
      duration        = each.value.duracion
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
      trigger { count = 1 }
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
    condition_absent {
      filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.seguridad["latido_api"].name}\""
      duration = "${var.ventana_latido_segundos}s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
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

  retention_policy {
    retention_period = 7 * 86400
    is_locked        = false
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
