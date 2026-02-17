# Security Notes

## Secrets
- Use environment variables for all API keys and JWT secret.
- Do not commit .env files.

## Auth
- JWT with short-lived access token and refresh token.
- Hash passwords with strong algo (e.g., bcrypt/argon2).

## Data protection
- Store minimal PII (email only).
- Allow user to delete account and session data.

## Sandbox
- Execute code inside Docker with resource limits.
- Disallow network access from sandbox containers.
- Limit runtime and memory to prevent abuse.
- Backend mounts Docker socket in dev; replace with dedicated sandbox service in production.
- Treat Gemini API key like other secrets: store in env, rotate, and never log.

## Logging
- Avoid logging raw audio or video frames.
- Log only metadata and error summaries.
