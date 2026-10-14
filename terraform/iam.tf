data "google_service_account" "cloud_run" {
  account_id = split("@", var.cloud_run_service_account)[0]
  project    = var.project_id
}
