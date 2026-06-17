locals {
  repository_id      = "${var.app_name}-repo"
  cloud_sql_instance = "${var.app_name}-mysql"
  service_name       = var.app_name
  image              = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository_id}/${var.app_name}:${var.image_tag}"
  jwt_secret         = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  gemini_api_key     = var.gemini_api_key != "" ? var.gemini_api_key : "replace-me"
}

resource "google_project_service" "services" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = local.repository_id
  description   = "Container images for ${var.app_name}"
  format        = "DOCKER"

  depends_on = [google_project_service.services]
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.app_name}-db-password"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "${var.app_name}-jwt-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = local.jwt_secret
}

resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "${var.app_name}-gemini-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "gemini_api_key" {
  secret      = google_secret_manager_secret.gemini_api_key.id
  secret_data = local.gemini_api_key
}

resource "google_sql_database_instance" "mysql" {
  name             = local.cloud_sql_instance
  database_version = "MYSQL_8_0"
  region           = var.region

  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true

    backup_configuration {
      enabled = true
    }

    ip_configuration {
      ipv4_enabled = true
    }
  }

  deletion_protection = false

  depends_on = [google_project_service.services]
}

resource "google_sql_database" "app" {
  name     = var.database_name
  instance = google_sql_database_instance.mysql.name
}

resource "google_sql_user" "app" {
  name     = var.database_user
  instance = google_sql_database_instance.mysql.name
  password = random_password.db_password.result
}

resource "google_service_account" "cloud_run" {
  account_id   = "${var.app_name}-run"
  display_name = "Cloud Run runtime for ${var.app_name}"

  depends_on = [google_project_service.services]
}

resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "cloud_run_db_password" {
  secret_id = google_secret_manager_secret.db_password.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "cloud_run_jwt_secret" {
  secret_id = google_secret_manager_secret.jwt_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "cloud_run_gemini_api_key" {
  secret_id = google_secret_manager_secret.gemini_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_cloud_run_v2_service" "app" {
  name                = local.service_name
  location            = var.region
  deletion_protection = false

  scaling {
    min_instance_count = 0
  }

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.mysql.connection_name]
      }
    }

    containers {
      image = local.image

      ports {
        container_port = 8080
      }

      env {
        name  = "DB_USER"
        value = var.database_user
      }

      env {
        name = "DB_PASS"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "DB_NAME"
        value = var.database_name
      }

      env {
        name  = "INSTANCE_UNIX_SOCKET"
        value = "/cloudsql/${google_sql_database_instance.mysql.connection_name}"
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "GEMINI_MODEL"
        value = var.gemini_model
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  depends_on = [
    google_artifact_registry_repository.app,
    google_project_iam_member.cloud_run_sql_client,
    google_secret_manager_secret_iam_member.cloud_run_db_password,
    google_secret_manager_secret_iam_member.cloud_run_jwt_secret,
    google_secret_manager_secret_iam_member.cloud_run_gemini_api_key,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
