data "google_service_account" "cloud_run" {
  account_id = split("@", var.cloud_run_service_account)[0]
  project    = var.project_id
}

data "google_service_account" "api" {
  account_id = split("@", var.api_service_account)[0]
  project    = var.project_id
}

# Both Cloud Run revisions (stable and canary) read DATABASE_URL from this secret
resource "google_secret_manager_secret_iam_member" "api_reads_database_url" {
  secret_id = data.google_secret_manager_secret.database_url_cloudrun.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_service_account.api.email}"
}
