# Dev Setup (Draft)

## Requirements
- Node.js LTS
- Python 3.11+
- Docker
- PostgreSQL 15+
- Native libs pentru DeepFace/OpenCV: `libgl1`, `libglib2.0-0`, `ffmpeg`; pentru DeepFace/mtcnn instalăm TensorFlow CPU (vezi requirements-vision.txt).

## Environment variables
Backend (.env):
- DATABASE_URL
- JWT_SECRET
- OPENAI_API_KEY
- OPENAI_MODEL (default gpt-4o-mini)
- OPENAI_WHISPER_MODEL (default whisper-1)
- OPENAI_TTS_MODEL (default tts-1)
- OPENAI_TTS_VOICE (default alloy)
- OPENAI_TIMEOUT_SECONDS (default 20)
- CORS_ORIGINS
- SQLITE_FALLBACK_URL
- DB_CONNECT_RETRIES
- DB_CONNECT_DELAY_SECONDS
- SANDBOX_IMAGE
- SANDBOX_TIMEOUT_SECONDS
- SANDBOX_MEMORY_MB
- SANDBOX_CPU
- SANDBOX_PIDS_LIMIT
- AI_PROVIDER (openai|gemini)
- GEMINI_API_KEY
- GEMINI_MODEL (default gemini-1.5-pro)
- SANDBOX_TIMEOUT_SECONDS
- SANDBOX_MEMORY_MB
- SANDBOX_CPU
- SANDBOX_PIDS_LIMIT

Frontend (.env):
- VITE_API_BASE_URL

## Local dev flow
1. Copy env templates:
   - backend/.env.example -> backend/.env
   - frontend/.env.example -> frontend/.env
2. Start PostgreSQL (Docker Compose recommended).
3. Run migrations (alembic upgrade head or python backend/scripts/init_db.py).
4. Start backend (FastAPI + Uvicorn).
5. Start frontend (Vite).
6. Run Docker sandbox service (code execution).

## DB fallback behavior
- If DATABASE_URL is PostgreSQL and the connection fails after retries, backend falls back to SQLITE_FALLBACK_URL.

## Docker Compose (dev)
- docker compose -f infrastructure/docker-compose.yml up --build

## Run the app (Docker Compose)
1. Use helper script (auto-creates .env if missing):
   - ./scripts/dev_up.sh (nu reconstruiește imaginile)
   - pentru rebuild: DEV_UP_BUILD=1 ./scripts/dev_up.sh sau ./scripts/dev_up.sh --build (necesar după schimbări de Dockerfile/requirements)
2. Migrations rulează automat la start prin entrypoint; dacă vrei să le rulezi manual:
   - docker compose -f infrastructure/docker-compose.yml run --rm backend alembic upgrade head
3. Open:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:8000/api/v1/health

## Run the app (Local)
1. Ensure Postgres is running or rely on SQLite fallback.
2. Backend:
   - python3.11 -m venv backend/.venv
   - source backend/.venv/bin/activate
   - pip install -r backend/requirements.txt
   - pip install -r backend/requirements-vision.txt
   - cd backend && alembic upgrade head
   - uvicorn app.main:app --reload
3. Frontend:
   - cd frontend && npm install
   - npm run dev
4. Open:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:8000/api/v1/health

## Auto-create env
- If backend/.env or frontend/.env is missing, ./scripts/dev_up.sh copies from .env.example.
