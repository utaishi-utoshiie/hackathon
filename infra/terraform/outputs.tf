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

output "gemini_secret" {
  value = google_secret_manager_secret.gemini_api_key.secret_id
}
