# Hackathon TODO

## Phase 1: Design

- [x] UI/UX: define the main screens and user flow.
- [x] DB: define tables, columns, relations, and indexes.
- [x] API: define endpoints, request JSON, and response JSON.

## Phase 2: Foundation

- [x] Backend: create a Go API server.
- [x] Frontend: create a React app.
- [x] DB: prepare local MySQL schema.
- [x] Infra: prepare Cloud Run, Vercel, and Cloud SQL deployment notes.

## Phase 3: Core Features

- [x] User registration and login.
- [x] Item listing and item detail.
- [x] Item creation.
- [x] Purchase flow without payment integration.
- [x] Direct messages between users.
- [x] Likes.
- [x] OpenAI API integration for AI item description and Q&A.

## Phase 4: Polish

- [x] Improve UI/UX for demo flow.
- [x] Add image upload flow with Cloud Storage signed URLs.
- [x] Add item search and filters.
- [x] Stabilize Cloud Run DB startup for login.
- [x] Add profile avatar upload and DM item summary.
- [x] Add item cancellation flow.
- [x] Add private profile photo storage and personalized AI scene generation.
- [ ] Add basic tests.
- [x] Add README startup steps.
- [ ] Prepare demo script.

## Work Log

### 2026-06-17

- Created design documents in `docs/`.
- Added `docs/ui-flow.md` for main screens, user flow, and demo flow.
- Added `docs/db-design.md` for tables, relations, and indexes.
- Added `docs/api-spec.md` for auth, items, purchases, messages, and AI endpoints.
- Created Go backend in `backend/`.
- Added MySQL migration at `backend/migrations/001_init.sql`.
- Implemented REST APIs for user registration, login, items, likes, purchases, conversations, messages, and OpenAI calls.
- Added `backend/Dockerfile` for Cloud Run deployment.
- Added `backend/.env.example` for local and Cloud Run environment variables.
- Created React frontend in `frontend/`.
- Implemented login/register, item list, item detail, item creation, AI description generation, AI Q&A, purchase, like, and DM UI.
- Added local MySQL setup in `docker-compose.yaml`.
- Updated `README.md` with local startup steps and deployment direction for Cloud Run, Vercel, and Cloud SQL.
- Verified backend with `GOMODCACHE=/private/tmp/gomodcache GOCACHE=/private/tmp/gocache go test ./...`.
- Verified frontend with `npm run build`.
- Verified production dependency audit with `npm audit --omit=dev`.
- Started local MySQL, backend, and frontend dev server.
- Confirmed `GET /api/healthz` returns `{"status":"ok"}`.
- Confirmed `POST /api/auth/register` creates a user in MySQL.

### 2026-06-18

- Added `POST /api/upload` to issue Cloud Storage signed URLs for direct image uploads.
- Added `GCS_BUCKET`, `GCS_CLIENT_EMAIL`, and `GCS_PRIVATE_KEY` to backend environment examples.
- Added keyword, category, and price-range filters to `GET /api/items`.
- Updated the home screen with search/filter controls, loading state, and Japanese error messages.
- Updated the sell screen with image file selection, upload progress, image preview, and submit error handling.
- Updated `docs/api-spec.md` for item filters and upload URL issuance.

### 2026-06-18 DB startup fix

- Added DB readiness details to `/api/healthz` and guarded API errors so `database is starting` includes the latest connection state.
- Set Terraform Cloud Run minimum instances to 1 by default to reduce cold-start DB waits before login.
- Added `scripts/stabilize-cloud-run-db.sh` for gcloud-based Cloud Run/Cloud SQL repair.
- Added `docs/db-startup-troubleshooting.md` for contributors.
- Added backend tests for DB startup guard responses and DSN resolution.

### 2026-06-18 profile and DM updates

- Added profile avatar upload support on My Page.
- Added `POST /api/profile` to save avatar URLs.
- Added `GET /api/my/items` so My Page can show hidden items after cancellation.
- Added `POST /api/items/{id}/cancel` to hide active listings owned by the seller.
- Expanded DM conversation payloads with item summary and counterpart avatar data.

### 2026-06-18 private avatar and AI scene updates

- Changed profile photo uploads to private object storage flow.
- Added personalized AI usage-scene generation on the item detail page while keeping the original item image visible.
- Added `item_scene_generations` persistence and API endpoints for per-user generated item scenes.
- Stopped exposing private profile photos to other users in DM payloads.

### 2026-06-18 AI Agent Negotiation and Dual Dashboards

- Added dynamic database migration hooks: auto-expanding the `items` table with `min_price` and `ai_personality`, and creating the `negotiations` table.
- Implemented an iterative 6-turn multi-agent price negotiation simulator endpoint (`POST /api/items/{id}/negotiate`), executing a live simulated price bargaining loop between Buyer AI (budget & desire-driven) and Seller AI (character personality-driven), completing automatic purchases on success.
- Created interactive React UI overlays in `CreateItemScreen` and `ItemDetailScreen` to allow sellers to specify minimum price and agent personality, and allow buyers to activate AI negotiation with live-reveal chat animations and sequential turn-by-turn dialogue suspense.
- Created `GET /api/my/stats` to aggregate and return personal analytics for the logged-in user (sold revenue, quantities, active listings, likes, categories, and sales trends).
- Refactored `MyPageScreen` to feature a tab toggle between Listings and "My Dashboard" (個人分析), visualizing personal sales KPIs and trend progress bars.
- Integrated a secure "🛡️ システム管理者ダッシュボードを開く" button in the profile section on My Page for users with the `admin` role to transition seamlessly to the platform-wide Admin Dashboard.
- Added comprehensive Go unit tests for middleware (`requireAdmin`), helper functions (`splitClean`), and formatting logic (`formatHistory`), successfully verifying compilation and test suites.

## Remaining Notes

- `OPENAI_API_KEY` must be set before AI generation works in the running backend.
- Demo script is still TODO.
