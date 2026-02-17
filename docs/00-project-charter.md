# AI Interview Coach - Project Charter

## Purpose
Create a web platform that helps students prepare for interviews through realistic simulations, voice feedback, and behavioral analysis.

## Scope (MVP)
- Auth + profile management with experience level and tech stack.
- Voice-first interview simulator with low latency.
- Multimodal emotion detection from periodic video snapshots.
- Code sandbox for technical evaluation.
- Final structured report with technical, communication, and non-verbal analysis.

## Non-goals (Phase 1)
- Full mobile app.
- Live interviewer marketplace.
- Real-time collaborative interviews with multiple candidates.

## Success criteria
- End-to-end interview session works without manual intervention.
- Median voice round-trip latency under 2 seconds in a local dev environment.
- Report JSON is complete, consistent, and exportable.

## Stakeholders
- Students (primary users).
- Faculty/mentors (secondary).
- Admins (ops, monitoring).

## Assumptions
- OpenAI API access is available.
- Camera and microphone permissions are granted by user.
- Local dev uses Docker for code execution isolation.
