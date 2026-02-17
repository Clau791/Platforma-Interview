#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] waiting for database and applying migrations..."
max_retries=${DB_CONNECT_RETRIES:-10}
delay_seconds=${DB_CONNECT_DELAY_SECONDS:-2}

for attempt in $(seq 1 "$max_retries"); do
  if alembic upgrade head; then
    echo "[entrypoint] migrations applied"
    break
  fi
  echo "[entrypoint] migration attempt ${attempt}/${max_retries} failed; retrying in ${delay_seconds}s"
  sleep "$delay_seconds"
  if [[ "$attempt" == "$max_retries" ]]; then
    echo "[entrypoint] migrations failed after ${max_retries} attempts"
    exit 1
  fi
done

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
