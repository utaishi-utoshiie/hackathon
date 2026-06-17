locals {
  repository_id      = "${var.app_name}-repo"
  cloud_sql_instance = "${var.app_name}-mysql"
  service_name       = var.app_name
  uploads_bucket     = "${var.project_id}-${var.app_name}-uploads"
  image              = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository_id}/${var.app_name}:${var.image_tag}"
  jwt_secret         = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  openai_secret_id   = "${var.app_name}-openai-api-key"
  cloud_build_sa     = "${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service" "services" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
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

data "google_secret_manager_secret" "openai_api_key" {
  secret_id = local.openai_secret_id
}

resource "google_storage_bucket" "uploads" {
  name                        = local.uploads_bucket
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  cors {
    origin          = ["*"]
    method          = ["GET", "PUT", "OPTIONS"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.services]
}

resource "google_service_account_key" "cloud_run_upload_signer" {
  service_account_id = google_service_account.cloud_run.name
}

resource "google_secret_manager_secret" "gcs_private_key" {
  secret_id = "${var.app_name}-gcs-private-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "gcs_private_key" {
  secret      = google_secret_manager_secret.gcs_private_key.id
  secret_data = jsondecode(base64decode(google_service_account_key.cloud_run_upload_signer.private_key)).private_key
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

resource "google_secret_manager_secret_iam_member" "cloud_run_openai_api_key" {
  secret_id = data.google_secret_manager_secret.openai_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "cloud_run_gcs_private_key" {
  secret_id = google_secret_manager_secret.gcs_private_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_storage_bucket_iam_member" "cloud_run_upload_object_creator" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_build_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${local.cloud_build_sa}"
}

resource "google_service_account_iam_member" "cloud_build_service_account_user" {
  service_account_id = google_service_account.cloud_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${local.cloud_build_sa}"
}

resource "google_artifact_registry_repository_iam_member" "cloud_build_artifact_writer" {
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${local.cloud_build_sa}"
}

resource "google_cloud_run_v2_service" "app" {
  name                = local.service_name
  location            = var.region
  deletion_protection = false

  scaling {
    min_instance_count = var.cloud_run_min_instances
  }

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.cloud_run_min_instances
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
        name = "OPENAI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.openai_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "OPENAI_MODEL"
        value = var.openai_model
      }

      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.uploads.name
      }

      env {
        name  = "GCS_CLIENT_EMAIL"
        value = google_service_account.cloud_run.email
      }

      env {
        name = "GCS_PRIVATE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gcs_private_key.secret_id
            version = "latest"
          }
        }
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
    google_secret_manager_secret_iam_member.cloud_run_openai_api_key,
    google_secret_manager_secret_iam_member.cloud_run_gcs_private_key,
    google_secret_manager_secret_version.gcs_private_key,
    google_storage_bucket_iam_member.cloud_run_upload_object_creator,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloudbuild_trigger" "github_main" {
  count       = var.enable_github_trigger ? 1 : 0
  name        = "${var.app_name}-github-main"
  description = "Build and deploy ${var.github_owner}/${var.github_repository} main branch to Cloud Run"
  filename    = "cloudbuild.yaml"

  github {
    owner = var.github_owner
    name  = var.github_repository

    push {
      branch = var.github_branch_regex
    }
  }

  substitutions = {
    _REGION     = var.region
    _REPOSITORY = local.repository_id
    _IMAGE      = var.app_name
    _SERVICE    = local.service_name
    _TAG        = var.image_tag
  }

  depends_on = [
    google_artifact_registry_repository.app,
    google_project_iam_member.cloud_build_run_admin,
    google_service_account_iam_member.cloud_build_service_account_user,
    google_artifact_registry_repository_iam_member.cloud_build_artifact_writer,
  ]
}
