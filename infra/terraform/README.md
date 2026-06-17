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

Create the OpenAI API key secret before the full Terraform apply:

```bash
printf '%s' 'YOUR_OPENAI_API_KEY' | gcloud secrets create next-market-openai-api-key \
  --project term9-toshiie-shiomi \
  --replication-policy=automatic \
  --data-file=-
```

Build and push the container image:

```bash
cd ../..
gcloud builds submit --project term9-toshiie-shiomi --config cloudbuild.yaml .
```

`cloudbuild.yaml` also deploys the pushed image to Cloud Run. For automatic deploys on GitHub `main` pushes, connect `toshtosh2024/hackathon` to Cloud Build's GitHub app first, then set:

```hcl
enable_github_trigger = true
```

Deploy the remaining resources:

```bash
cd infra/terraform
GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)" terraform apply
terraform output cloud_run_url
```

To rotate the OpenAI key after deployment:

```bash
printf '%s' 'YOUR_OPENAI_API_KEY' | gcloud secrets versions add next-market-openai-api-key \
  --project term9-toshiie-shiomi \
  --data-file=-
```
