# Integration Steps (End-to-End)

## 0. Repository layout
- /frontend: React + Vite + Tailwind + Monaco
- /backend: FastAPI + SQLAlchemy + Auth + AI services
- /infrastructure: Docker files, compose, sandbox templates
- /docs: Documentation and worklog

## 1. Environment setup
1. Install Node.js LTS, Python 3.11+, Docker, PostgreSQL client.
2. Use helper script to create env files if missing:
   - ./scripts/dev_up.sh (creates backend/.env and frontend/.env)
3. Fill secrets:
    - OPENAI_API_KEY
    - JWT_SECRET
    - DATABASE_URL
    - GEMINI_API_KEY (optional, set AI_PROVIDER=gemini to use it)

## 2. Database
1. Start Postgres (Docker Compose recommended).
2. Run migrations to create tables (alembic upgrade head).
3. Create a dev user if needed.
4. If Postgres is down at startup (after retries), backend will fall back to SQLITE_FALLBACK_URL.

## 3. Backend integration
1. Start FastAPI server with Uvicorn.
2. Validate /health endpoint.
3. Configure CORS to allow frontend origin.
4. Verify JWT flow: register -> login -> access protected endpoints.
5. Validate session creation and retrieval.

## 4. Frontend integration
1. Start Vite dev server.
2. Set API base URL in frontend/.env.
3. Log in and load profile.
4. Validate audio capture permission.
5. Validate snapshot capture permission.

## 5. Voice-first pipeline
1. Record audio in browser.
2. Upload to backend /sessions/{id}/audio.
3. Backend calls Whisper -> text.
4. LLM generates response with system context.
5. Backend calls TTS -> audio.
6. Frontend plays audio and shows transcript.

## 6. Emotion pipeline
1. Capture frame every 3-5s.
2. Upload to backend /sessions/{id}/emotion.
3. Backend runs emotion detection.
4. Store emotion in DB and forward as LLM system context.

## 7. Code sandbox pipeline
1. User edits code in Monaco.
2. Submit code to backend /sessions/{id}/code/execute.
3. Backend runs code in Docker with resource limits.
4. Return stdout/stderr to LLM for evaluation.

## 8. Reporting
1. End session.
2. Generate report JSON.
3. Store in DB and expose /sessions/{id}/report.

## 9. Observability
1. Log latency for STT/LLM/TTS.
2. Track session state transitions.
3. Capture error codes and retry info.

## 10. Run the app
### Docker Compose
1. docker compose -f infrastructure/docker-compose.yml up --build
2. docker compose -f infrastructure/docker-compose.yml run --rm backend alembic upgrade head
3. Open frontend at http://localhost:5173

### Local
1. Backend: uvicorn app.main:app --reload (after alembic upgrade head)
2. Frontend: npm run dev
