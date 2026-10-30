data "google_project" "current" {
  project_id = var.project_id
}

data "google_sql_database_instance" "production" {
  name    = "medical-devops-db"
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

# Same database, but through the Cloud SQL socket that Cloud Run mounts
# (?host=/cloudsql/...). Created once by hand from the GKE value so the
# password never goes through Terraform state.
data "google_secret_manager_secret" "database_url_cloudrun" {
  secret_id = "medical-api-database-url-cloudrun"
  project   = var.project_id
}

data "google_secret_manager_secret" "database_url_sync" {
  secret_id = "medical-api-database-url-sync"
  project   = var.project_id
}
