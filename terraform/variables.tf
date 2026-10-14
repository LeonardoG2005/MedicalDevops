variable "project_id" {
  description = "Google Cloud project that hosts the existing MedicalDevops platform."
  type        = string
  default     = "project-40fc41d1-6899-4ce0-9ef"
}

variable "region" {
  description = "Primary Google Cloud region."
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment label used for names and labels."
  type        = string
  default     = "academic"
}

variable "resource_prefix" {
  description = "Prefix for resources created by this configuration."
  type        = string
  default     = "medical-devops"
}

variable "results_bucket_name" {
  description = "Globally unique bucket name for workflow results and attachments."
  type        = string
  default     = ""
}

variable "cloud_run_service_account" {
  description = "Existing Cloud Run service account that may write workflow results."
  type        = string
  default     = "medical-orchestrator-gsa@project-40fc41d1-6899-4ce0-9ef.iam.gserviceaccount.com"
}

variable "enable_apis" {
  description = "Enable APIs required by the platform. Set false if project administration is external."
  type        = bool
  default     = true
}

variable "manage_existing_bucket_iam" {
  description = "Grant the existing Cloud Run identity object-admin access to the new bucket."
  type        = bool
  default     = true
}
