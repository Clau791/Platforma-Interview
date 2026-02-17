# Infrastructure

## Docker Compose (dev)
- Start stack: ./scripts/dev_up.sh
- Stop stack: docker compose -f infrastructure/docker-compose.yml down

## Notes
- Backend reads .env from /backend/.env.
- Sandbox container provides isolated code execution (python + node).
- Backend container mounts /var/run/docker.sock for sandbox runs.
