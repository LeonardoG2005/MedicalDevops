output "results_bucket" {
  description = "Bucket created by Terraform for workflow results."
  value       = google_storage_bucket.workflow_results.name
}

output "artifact_registry_repository" {
  description = "Existing Artifact Registry repository reused by the pipelines."
  value       = google_artifact_registry_repository.api.name
}

output "cloud_sql_instance" {
  description = "Existing production Cloud SQL instance used through the Auth Proxy."
  value       = data.google_sql_database_instance.production.name
}

output "cloud_sql_database" {
  description = "Existing application database; credentials remain in Secret Manager."
  value       = google_sql_database.application.name
}

output "pubsub_subscription" {
  description = "Existing Orchestrator event subscription."
  value       = google_pubsub_subscription.events.name
}
