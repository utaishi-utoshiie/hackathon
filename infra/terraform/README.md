# GCP Deploy

This Terraform deploys the app to Cloud Run with Cloud SQL for MySQL.

## Prerequisites

- GCP project: `term9-toshiie-shiomi`
- Billing enabled on the project
- Active gcloud account: `taishi14ki@gmail.com`

## Deploy

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)" terraform apply \
  -target=google_project_service.services \
  -target=google_artifact_registry_repository.app
```

Build and push the container image:

```bash
cd ../..
gcloud builds submit --project term9-toshiie-shiomi --config cloudbuild.yaml .
```

Deploy the remaining resources:

```bash
cd infra/terraform
GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)" terraform apply
terraform output cloud_run_url
```

To set or rotate the Gemini key after deployment:

```bash
printf '%s' 'YOUR_GEMINI_API_KEY' | gcloud secrets versions add next-market-gemini-api-key \
  --project term9-toshiie-shiomi \
  --data-file=-
```
