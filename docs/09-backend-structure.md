# Backend Structure

## Folder map
- app/main.py: FastAPI app, CORS, router mounting.
- app/core/config.py: Settings loaded from .env.
- app/db/base.py, app/db/session.py: SQLAlchemy Base and session.
- app/models/: ORM models for users, profiles, sessions, messages, emotions, code runs, reports.
- app/schemas/: Pydantic request/response schemas.
- app/api/routes/: REST endpoints grouped by domain.
- app/services/: AI, audio, emotion, sandbox stubs and user utilities.
- app/utils/: JWT, password hashing, error types.
- alembic/: migration environment and versions.
- alembic.ini: Alembic configuration.
- scripts/init_db.py: migration bootstrap script.

## API modules
- auth: register/login -> JWT.
- profile: get/update profile.
- sessions: create/get/start/end session.
- audio: voice pipeline entrypoint.
- emotion: snapshot pipeline entrypoint.
- code: code execution entrypoint.
- report: report retrieval.

## Placeholder behaviors
- Emotion detection returns neutral.

## Next implementation milestones
- Add migrations (Alembic) and DB init scripts.
- Implement AI clients with retries/timeouts.
- Implement sandbox runner with Docker resource limits.
