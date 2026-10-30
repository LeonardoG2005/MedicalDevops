# Business metric: the API logs one JSON line per note registration attempt
# (src/services/metrics.js), labeled by result and track. Coming from Cloud
# Run, the log also carries revision_name, so stable and canary can be
# compared on how often they actually register a note, not just HTTP status.
resource "google_logging_metric" "notas_registradas" {
  name        = "medical_api_notas_registradas"
  description = "Intentos de registrar una nota medica, por resultado y prioridad"
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.evento=\"nota_medica_registrada\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"

    labels {
      key         = "resultado"
      value_type  = "STRING"
      description = "registrada o rechazada"
    }

    labels {
      key         = "track"
      value_type  = "STRING"
      description = "stable o canary"
    }
  }

  label_extractors = {
    resultado = "EXTRACT(jsonPayload.resultado)"
    track     = "EXTRACT(jsonPayload.track)"
  }

  depends_on = [google_project_service.required]
}
