# Side by side dashboard: every chart groups by revision_name, so stable and
# canary show up as two separate lines on the same graph.
locals {
  filtro_servicio = "monitored_resource=\"cloud_run_revision\",service_name=\"${var.servicio_cloud_run}\""

  graficos = [
    {
      titulo   = "Reparto de trafico (peticiones por segundo)"
      consulta = "sum by (revision_name) (rate(run_googleapis_com:request_count{${local.filtro_servicio}}[1m]))"
    },
    {
      titulo = "Errores 5xx (fraccion de las peticiones)"
      # "or ... * 0" keeps the series at 0 instead of disappearing when a revision had no errors
      consulta = join(" / ", [
        "(sum by (revision_name) (rate(run_googleapis_com:request_count{${local.filtro_servicio},response_code_class=\"5xx\"}[1m])) or sum by (revision_name) (rate(run_googleapis_com:request_count{${local.filtro_servicio}}[1m])) * 0)",
        "sum by (revision_name) (rate(run_googleapis_com:request_count{${local.filtro_servicio}}[1m]))",
      ])
    },
    {
      titulo = "Errores 4xx (fraccion de las peticiones)"
      consulta = join(" / ", [
        "(sum by (revision_name) (rate(run_googleapis_com:request_count{${local.filtro_servicio},response_code_class=\"4xx\"}[1m])) or sum by (revision_name) (rate(run_googleapis_com:request_count{${local.filtro_servicio}}[1m])) * 0)",
        "sum by (revision_name) (rate(run_googleapis_com:request_count{${local.filtro_servicio}}[1m]))",
      ])
    },
    {
      titulo   = "Latencia p50 (ms)"
      consulta = "histogram_quantile(0.50, sum by (le, revision_name) (rate(run_googleapis_com:request_latencies_bucket{${local.filtro_servicio}}[2m])))"
    },
    {
      titulo   = "Latencia p95 (ms)"
      consulta = "histogram_quantile(0.95, sum by (le, revision_name) (rate(run_googleapis_com:request_latencies_bucket{${local.filtro_servicio}}[2m])))"
    },
    {
      titulo   = "Latencia p99 (ms)"
      consulta = "histogram_quantile(0.99, sum by (le, revision_name) (rate(run_googleapis_com:request_latencies_bucket{${local.filtro_servicio}}[2m])))"
    },
    {
      titulo   = "Saturacion: CPU del contenedor (p95)"
      consulta = "histogram_quantile(0.95, sum by (le, revision_name) (rate(run_googleapis_com:container_cpu_utilizations_bucket{${local.filtro_servicio}}[2m])))"
    },
    {
      titulo   = "Saturacion: memoria del contenedor (p95)"
      consulta = "histogram_quantile(0.95, sum by (le, revision_name) (rate(run_googleapis_com:container_memory_utilizations_bucket{${local.filtro_servicio}}[2m])))"
    },
    {
      titulo   = "Negocio: notas registradas por resultado (por minuto)"
      consulta = "sum by (revision_name, resultado) (increase(logging_googleapis_com:user_${google_logging_metric.notas_registradas.name}{monitored_resource=\"cloud_run_revision\"}[1m]))"
    },
  ]
}

resource "google_monitoring_dashboard" "canary" {
  dashboard_json = jsonencode({
    displayName = "Medical API: stable contra canary"
    mosaicLayout = {
      columns = 12
      tiles = [
        for i, grafico in local.graficos : merge(
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
