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

variable "gemini_api_key" {
  description = "Gemini API key. Leave empty to create an empty secret placeholder."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gemini_model" {
  description = "Gemini model used by the application."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "jwt_secret" {
  description = "JWT signing secret. Leave empty to generate one."
  type        = string
  default     = ""
  sensitive   = true
}
