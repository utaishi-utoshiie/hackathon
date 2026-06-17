output "artifact_registry_repository" {
  value = google_artifact_registry_repository.app.name
}

output "image" {
  value = local.image
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.mysql.connection_name
}

output "cloud_run_url" {
  value = google_cloud_run_v2_service.app.uri
}

output "openai_secret" {
  value = data.google_secret_manager_secret.openai_api_key.secret_id
}

output "uploads_bucket" {
  value = google_storage_bucket.uploads.name
}

output "github_trigger" {
  value = var.enable_github_trigger ? google_cloudbuild_trigger.github_main[0].name : null
}
