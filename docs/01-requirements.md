# Requirements

## Functional
1. User authentication with JWT (login, register, refresh).
2. Profile management: experience level, target role, technologies.
3. Voice-first interview loop (STT -> LLM -> TTS -> playback).
4. Video snapshot upload every 3-5 seconds.
5. Emotion detection (stress, fear, confidence) from snapshots.
6. Code editor with code execution in isolated environment.
7. Session report JSON with technical, communication, and non-verbal sections.

## Non-functional
- Low latency for voice pipeline; target <2s median.
- Resilient to API failures with graceful degradation.
- Secure handling of API keys and user data.
- Scalable architecture for multiple concurrent sessions.
- Auditability and reproducibility of reports.

## UX Constraints
- Voice-first interaction is primary; text input is secondary.
- Provide clear permission prompts for mic/camera.
- Show session progress and feedback timeline.
