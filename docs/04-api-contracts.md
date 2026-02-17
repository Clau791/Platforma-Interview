# API Contracts (Draft)

Base path: /api/v1

## Auth
- POST /auth/register
- POST /auth/login
- POST /auth/refresh

## Profile
- GET /profile
- PUT /profile

## Interview sessions
- POST /sessions (create session)
- GET /sessions/{id}
- POST /sessions/{id}/start
- POST /sessions/{id}/end

## Voice pipeline
- POST /sessions/{id}/audio (upload audio chunk or full)
  - Response: {transcript, assistant_text, tts_audio_url, latency_ms}
  - Note: tts_audio_url is a data URL (audio/mpeg) when TTS is enabled

## Vision pipeline
- POST /sessions/{id}/emotion (upload frame)
  - Response: {emotion, confidence}

## Code execution
- POST /sessions/{id}/code/execute
  - Response: {stdout, stderr, exit_code}

## Reporting
- GET /sessions/{id}/report

## Notes
- All endpoints require JWT except register/login.
- Error format: {error_code, message, details?}
