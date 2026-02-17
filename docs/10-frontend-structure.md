# Frontend Structure

## Folder map
- src/App.jsx: App shell and routes.
- src/pages/: Landing, Login, Arena, Profile.
- src/components/: AudioRecorder, VideoSnapshot, CodeEditor.
- src/lib/: API client and auth token storage.

## Integration points
- Auth: /auth/login and /auth/register.
- Sessions: /sessions, /sessions/{id}/start.
- Voice: /sessions/{id}/audio (FormData audio).
- Vision: /sessions/{id}/emotion (FormData frame).
- Code: /sessions/{id}/code/execute.

## UX notes
- Voice-first interaction is exposed via AudioRecorder.
- Emotion capture uses periodic snapshots (4s interval).
- Code editor uses Monaco in dark theme.

## Next implementation milestones
- Add global error toasts and latency indicators.
- Add session timeline and report view.
- Add auth guards for protected pages.
