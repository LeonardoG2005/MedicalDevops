# Release 5: Ingenieria del Caos sobre el coordinador en GKE.
# - Secreto del interruptor de caos y permisos de lectura para la API.
# - Tablero de Cloud Monitoring sobre las metricas que Managed Prometheus
#   raspa de /metrics (k8s/pod-monitoring.yaml).
# - Alerta por fallo olvidado (interruptor encendido demasiado tiempo).

variable "gke_cluster_name" {
  description = "Cluster GKE que corre el coordinador v5."
  type        = string
  default     = "medical-devops-gke"
}

variable "gke_namespace" {
  description = "Namespace del coordinador en el cluster."
  type        = string
  default     = "default"
}

variable "canal_notificacion_id" {
  description = "ID completo (projects/.../notificationChannels/...) del canal de correo creado en Monitoring > Alerting. Vacio = alerta sin canal."
  type        = string
  default     = ""
}

# The secret was created by hand on 2026-11-16 (the value never goes through
# Terraform state; the same value lives in GitHub as CHAOS_TOKEN). This import
# block makes the first apply adopt it instead of failing with 409.
import {
  to = google_secret_manager_secret.chaos_token
  id = "projects/${var.project_id}/secrets/medical-api-chaos-token"
}

resource "google_secret_manager_secret" "chaos_token" {
  secret_id = "medical-api-chaos-token"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    release = "v5"
    uso     = "interruptor-de-caos"
  }

  depends_on = [google_project_service.required]
}

data "google_secret_manager_secret" "otel_endpoint" {
  secret_id = "otel-endpoint"
  project   = var.project_id
}

data "google_secret_manager_secret" "otel_headers" {
  secret_id = "otel-headers"
  project   = var.project_id
}

# The pods read these through the Secrets Store CSI driver with the Workload
# Identity of ns/default/sa/medical-api (k8s/secret-provider-class.yaml)
locals {
  secretos_gke = {
    chaos_token   = google_secret_manager_secret.chaos_token.secret_id
    otel_endpoint = data.google_secret_manager_secret.otel_endpoint.secret_id
    otel_headers  = data.google_secret_manager_secret.otel_headers.secret_id
  }
  lectores_gke = {
    gsa = "serviceAccount:${data.google_service_account.api.email}"
    wi  = "principal://iam.googleapis.com/projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${var.project_id}.svc.id.goog/subject/ns/${var.gke_namespace}/sa/medical-api"
  }
  accesos_gke = {
    for par in setproduct(keys(local.secretos_gke), keys(local.lectores_gke)) :
    "${par[0]}-${par[1]}" => { secreto = local.secretos_gke[par[0]], miembro = local.lectores_gke[par[1]] }
  }

  filtro_gke = "cluster=\"${var.gke_cluster_name}\",namespace=\"${var.gke_namespace}\""
  ruta_flujo = "/api/v5/flujo/:imagenId"

  graficos_caos = [
    {
      titulo   = "Metrica objetivo: p95 del flujo por ronda (ms)"
      consulta = "histogram_quantile(0.95, sum by (le, round) (rate(http_request_duration_seconds_bucket{${local.filtro_gke},route=\"${local.ruta_flujo}\"}[2m]))) * 1000"
    },
    {
      titulo   = "Resultado del flujo por segundo (ok, degradado, error)"
      consulta = "sum by (outcome, round) (rate(flow_requests_total{${local.filtro_gke}}[1m]))"
    },
    {
      titulo   = "Latencia p95 por dependencia (ms)"
      consulta = "histogram_quantile(0.95, sum by (le, peer, round) (rate(dependency_request_duration_seconds_bucket{${local.filtro_gke}}[2m]))) * 1000"
    },
    {
      titulo   = "Resultado de las llamadas salientes por segundo"
      consulta = "sum by (peer, outcome) (rate(dependency_request_duration_seconds_count{${local.filtro_gke}}[1m]))"
    },
    {
      titulo   = "Fallo activo en el interruptor de caos (ventana de inyeccion)"
      consulta = "max by (peer, type) (chaos_fault_active{${local.filtro_gke}})"
    },
    {
      titulo   = "Estado del circuit breaker (0 cerrado, 1 abierto, 2 semiabierto)"
      consulta = "max by (peer) (circuit_breaker_state{${local.filtro_gke}})"
    },
    {
      titulo = "Tasa de error 5xx del flujo por ronda"
      consulta = join(" / ", [
        "(sum by (round) (rate(http_requests_total{${local.filtro_gke},route=\"${local.ruta_flujo}\",status_code=~\"5..\"}[1m])) or sum by (round) (rate(http_requests_total{${local.filtro_gke},route=\"${local.ruta_flujo}\"}[1m])) * 0)",
        "sum by (round) (rate(http_requests_total{${local.filtro_gke},route=\"${local.ruta_flujo}\"}[1m]))",
      ])
    },
    {
      titulo   = "Peticiones al flujo por segundo y por pod"
      consulta = "sum by (pod) (rate(http_requests_total{${local.filtro_gke},route=\"${local.ruta_flujo}\"}[1m]))"
    },
  ]
}

resource "google_secret_manager_secret_iam_member" "gke_lee_secretos" {
  for_each  = local.accesos_gke
  project   = var.project_id
  secret_id = each.value.secreto
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.miembro
}

resource "google_monitoring_dashboard" "caos" {
  dashboard_json = jsonencode({
    displayName = "Medical API v5: experimento de caos (ronda 0 contra ronda 1)"
    mosaicLayout = {
      columns = 12
      tiles = [
        for i, grafico in local.graficos_caos : merge(
          { width = 6, height = 4 },
          i % 2 == 1 ? { xPos = 6 } : {},
          i >= 2 ? { yPos = floor(i / 2) * 4 } : {},
          {
            widget = {
              title = grafico.titulo
              xyChart = {
                dataSets = [{
                  timeSeriesQuery = { prometheusQuery = grafico.consulta }
                  plotType        = "LINE"
                  targetAxis      = "Y1"
                }]
              }
            }
          }
        )
      ]
    }
  })

  depends_on = [google_project_service.required]
}

# Last safety net for the chaos switch: every fault has a TTL of at most 15
# minutes, so one active for longer than that means the clock or the cache
# misbehaves and someone must look.
resource "google_monitoring_alert_policy" "caos_fallo_olvidado" {
  display_name = "Medical API v5: fallo del interruptor de caos activo mas de 15 minutos"
  combiner     = "OR"

  conditions {
    display_name = "chaos_fault_active en 1 durante 15 minutos"

    condition_prometheus_query_language {
      query               = "max(chaos_fault_active{${local.filtro_gke}}) >= 1"
      duration            = "900s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = var.canal_notificacion_id == "" ? [] : [var.canal_notificacion_id]

  documentation {
    mime_type = "text/markdown"
    content   = "El interruptor de caos lleva mas de 15 minutos con un fallo activo, mas que el TTL maximo. Revertir con DELETE /internal/chaos (chaos/probes.js revertir) y revisar la tabla chaos_faults."
  }

  depends_on = [google_project_service.required]
}

output "tablero_caos" {
  description = "ID del tablero del experimento de caos en Cloud Monitoring."
  value       = google_monitoring_dashboard.caos.id
}
