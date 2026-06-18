FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.25 AS build
WORKDIR /app
COPY backend/go.mod backend/go.sum* ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/api

FROM gcr.io/distroless/base-debian12
WORKDIR /app
COPY --from=build /app/server /app/server
COPY --from=build /app/migrations /app/migrations
COPY --from=frontend-build /frontend/dist /app/public
EXPOSE 8080
CMD ["/app/server"]
