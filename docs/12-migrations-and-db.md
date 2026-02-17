# Migrations and DB Init

## Alembic config
- Config file: backend/alembic.ini
- Migration env: backend/alembic/env.py
- Versions: backend/alembic/versions

## Initialize DB
From repo root:
1. Ensure DATABASE_URL in backend/.env.
2. Run migrations:
   - cd backend && alembic upgrade head
   - or python backend/scripts/init_db.py

## Runtime fallback
- If PostgreSQL is not reachable after retries at startup, the app falls back to SQLITE_FALLBACK_URL.
- Migrations always use DATABASE_URL (no auto-fallback).

## Create new migrations
From backend directory:
- alembic revision --autogenerate -m "add table x"
- alembic upgrade head

## Docker Compose
- docker compose -f infrastructure/docker-compose.yml run --rm backend alembic upgrade head
- docker compose -f infrastructure/docker-compose.yml run --rm backend python scripts/init_db.py
