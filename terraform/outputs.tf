output "results_bucket" {
  description = "Bucket created by Terraform for workflow results."
  value       = google_storage_bucket.workflow_results.name
}

output "artifact_registry_repository" {
  description = "Existing Artifact Registry repository reused by the pipelines."
  value       = data.google_artifact_registry_repository.api.name
}

output "gke_cluster" {
  description = "Existing GKE cluster reused by the API deployment."
  value       = data.google_container_cluster.gke.name
}

output "cloud_sql_instance" {
  description = "Existing production Cloud SQL instance used through the Auth Proxy."
  value       = data.google_sql_database_instance.production.name
}

output "cloud_sql_database" {
  description = "Existing application database; credentials remain in Secret Manager."
  value       = data.google_sql_database.application.name
}

output "pubsub_subscription" {
  description = "Existing Orchestrator event subscription."
  value       = data.google_pubsub_subscription.events.name
}

output "dead_letter_subscription" {
  description = "Existing dead-letter subscription."
  value       = data.google_pubsub_subscription.dead_letter.name
}
