data "google_project" "current" {
  project_id = var.project_id
}

data "google_sql_database_instance" "production" {
  name    = "medical-devops-db"
  project = var.project_id
}

data "google_sql_database" "application" {
  name     = "medical_devops"
  instance = data.google_sql_database_instance.production.name
  project  = var.project_id
}

data "google_artifact_registry_repository" "api" {
  location      = var.region
  repository_id = "medical-api"
  project       = var.project_id
}

data "google_container_cluster" "gke" {
  name     = "medical-devops-gke"
  location = var.region
  project  = var.project_id
}

data "google_pubsub_topic" "events" {
  name    = "medical-orchestrator-events"
  project = var.project_id
}

data "google_pubsub_subscription" "events" {
  name    = "medical-orchestrator-events-sub"
  project = var.project_id
}

data "google_pubsub_topic" "dead_letter" {
  name    = "medical-orchestrator-events-dlq"
  project = var.project_id
}

data "google_pubsub_subscription" "dead_letter" {
  name    = "medical-orchestrator-events-dlq-sub"
  project = var.project_id
}

data "google_secret_manager_secret" "database_url" {
  secret_id = "medical-api-database-url"
  project   = var.project_id
}

data "google_secret_manager_secret" "database_url_sync" {
  secret_id = "medical-api-database-url-sync"
  project   = var.project_id
}
