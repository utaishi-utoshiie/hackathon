variable "project_id" {
  description = "GCP project ID to deploy into."
  type        = string
  default     = "term9-toshiie-shiomi"
}

variable "region" {
  description = "Primary region for Cloud Run, Cloud SQL, and Artifact Registry."
  type        = string
  default     = "asia-northeast1"
}

variable "app_name" {
  description = "Application and resource name prefix."
  type        = string
  default     = "next-market"
}

variable "database_name" {
  description = "Cloud SQL database name."
  type        = string
  default     = "nextmarket"
}

variable "database_user" {
  description = "Cloud SQL application user."
  type        = string
  default     = "nextmarket"
}

variable "image_tag" {
  description = "Container image tag deployed to Cloud Run."
  type        = string
  default     = "latest"
}

variable "openai_model" {
  description = "OpenAI model used by the application."
  type        = string
  default     = "gpt-4o-mini"
}

variable "jwt_secret" {
  description = "JWT signing secret. Leave empty to generate one."
  type        = string
  default     = ""
  sensitive   = true
}

variable "cloud_run_min_instances" {
  description = "Minimum Cloud Run instances. Keep at least 1 during demos to avoid cold-start DB waits."
  type        = number
  default     = 1
}

variable "github_owner" {
  description = "GitHub repository owner for the Cloud Build trigger."
  type        = string
  default     = "toshtosh2024"
}

variable "github_repository" {
  description = "GitHub repository name for the Cloud Build trigger."
  type        = string
  default     = "hackathon"
}

variable "github_branch_regex" {
  description = "Branch regex that triggers automatic deployment."
  type        = string
  default     = "^main$"
}

variable "enable_github_trigger" {
  description = "Create the GitHub Cloud Build trigger. Requires the GitHub repository to be connected to Cloud Build first."
  type        = bool
  default     = false
}
