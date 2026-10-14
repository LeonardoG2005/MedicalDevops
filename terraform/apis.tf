locals {
  required_services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "container.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ])
}

resource "google_project_service" "required" {
  for_each                   = var.enable_apis ? local.required_services : toset([])
  project                    = var.project_id
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false
}
