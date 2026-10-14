resource "google_artifact_registry_repository" "api" {
  location      = var.region
  project       = var.project_id
  repository_id = "medical-api"
  description   = "Medical Documents API container images"
  format        = "DOCKER"
}

resource "google_sql_database" "application" {
  name      = "medical_devops"
  instance  = "medical-devops-db"
  project   = var.project_id
  charset   = "UTF8"
  collation = "en_US.UTF8"
}

resource "google_pubsub_topic" "events" {
  name    = "medical-orchestrator-events"
  project = var.project_id
}

resource "google_pubsub_subscription" "events" {
  name    = "medical-orchestrator-events-sub"
  topic   = google_pubsub_topic.events.id
  project = var.project_id

  ack_deadline_seconds       = 10
  message_retention_duration = "604800s"

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "60s"
  }

  push_config {
    push_endpoint = "https://medical-orchestrator-xuzo6mv7ta-uc.a.run.app/internal/pubsub"

    oidc_token {
      service_account_email = "medical-orchestrator-gsa@${var.project_id}.iam.gserviceaccount.com"
      audience              = "https://medical-orchestrator-xuzo6mv7ta-uc.a.run.app/internal/pubsub"
    }
  }

  dead_letter_policy {
    dead_letter_topic     = "projects/${var.project_id}/topics/medical-orchestrator-events-dlq"
    max_delivery_attempts = 5
  }
}
