#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BACKEND_ENV="$ROOT_DIR/backend/.env"
FRONTEND_ENV="$ROOT_DIR/frontend/.env"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "Creating backend/.env from .env.example"
  cp "$ROOT_DIR/backend/.env.example" "$BACKEND_ENV"
fi

if [[ ! -f "$FRONTEND_ENV" ]]; then
  echo "Creating frontend/.env from .env.example"
  cp "$ROOT_DIR/frontend/.env.example" "$FRONTEND_ENV"
fi

# By default, we do NOT rebuild to keep startup fast. Use DEV_UP_BUILD=1 or --build to force rebuild.
BUILD_FLAG=()
if [[ "${DEV_UP_BUILD:-0}" == "1" ]] || [[ "${1:-}" == "--build" ]]; then
  BUILD_FLAG=(--build)
fi

docker compose -f "$ROOT_DIR/infrastructure/docker-compose.yml" up ${BUILD_FLAG[@]+"${BUILD_FLAG[@]}"}
