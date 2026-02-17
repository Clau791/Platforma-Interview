# Docker Stack

## Services
- db: PostgreSQL 15 with persistent volume.
- backend: FastAPI app.
- frontend: Vite dev server.
- sandbox: isolated container for code execution (python + node).

## Compose file
- infrastructure/docker-compose.yml

## Notes
- Use backend/.env for API secrets.
- Default DB credentials are for local dev only.
- Backend mounts Docker socket to execute sandbox runs.
- Sandbox image tag: aic_sandbox_runner.
