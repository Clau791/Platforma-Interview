# Sandbox Execution

## Overview
Code execution runs inside a Docker container with strict resource limits. The backend calls docker run and mounts a temporary workspace as read-only.

## Supported languages
- python
- javascript

## Resource limits (defaults)
- CPU: 0.5
- Memory: 256 MB
- Timeout: 5 seconds
- PIDs: 64
- Network: disabled
- Filesystem: read-only with tmpfs for /tmp

## Configuration (.env)
- SANDBOX_IMAGE
- SANDBOX_TIMEOUT_SECONDS
- SANDBOX_MEMORY_MB
- SANDBOX_CPU
- SANDBOX_PIDS_LIMIT

## Image
- Built from infrastructure/sandbox/Dockerfile
- Tag: aic_sandbox_runner

## Backend entrypoint
- app/services/sandbox_service.py

## Notes
- Backend container mounts /var/run/docker.sock for docker run.
- For production, replace docker socket with a dedicated sandbox service.
