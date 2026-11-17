locals {
  results_bucket = var.results_bucket_name != "" ? var.results_bucket_name : "${var.resource_prefix}-${data.google_project.current.number}-results"
}

resource "google_storage_bucket" "workflow_results" {
  name                        = local.results_bucket
  location                    = var.region
  project                     = var.project_id
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  # Ronda 1 del experimento 4: inmutabilidad (WORM). Ningun principal, ni el
  # dueno del proyecto, puede borrar ni sobrescribir un objeto antes de 24 h.
  # El bloqueo es irreversible por diseno; la regla de ciclo de vida de 30 dias
  # sigue limpiando lo viejo.
  retention_policy {
    retention_period = 86400
    is_locked        = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    application = "medical-devops"
    environment = var.environment
    managed_by  = "terraform"
  }
}

resource "google_storage_bucket_iam_member" "orchestrator_writer" {
  count  = var.manage_existing_bucket_iam ? 1 : 0
  bucket = google_storage_bucket.workflow_results.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${var.cloud_run_service_account}"
}
