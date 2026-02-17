# Architecture Overview

## High-level components
- Frontend (React + Vite + Tailwind + Monaco): UI, audio capture/playback, video snapshots.
- Backend (FastAPI + SQLAlchemy): API, auth, session orchestration, AI calls.
- AI services: OpenAI (LLM, Whisper, TTS), Vision model (DeepFace/OpenCV).
- PostgreSQL: users, sessions, results, emotion timeline.
- Code sandbox: Docker isolated execution.

## Voice-first pipeline
1. Frontend records audio (chunked or full).
2. Backend runs STT (Whisper) -> text.
3. LLM generates next question/response (with system context).
4. Backend runs TTS -> audio.
5. Frontend plays audio; UI shows transcript if needed.

## Emotion feedback loop
- Frontend sends frame snapshots every 3-5 seconds.
- Backend runs emotion detection -> {emotion, confidence}.
- Detected emotion appended to LLM system context to adapt tone.

## Code evaluation
- Frontend submits code + language metadata.
- Backend runs code in Docker, captures stdout/stderr and exit code.
- Output is fed to LLM for evaluation and scoring.

## Data flow notes
- All AI calls should be asynchronous with timeouts and retries.
- Session orchestration is stateful in DB but exposed via stateless API.
