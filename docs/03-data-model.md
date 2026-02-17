# Data Model (Initial)

## users
- id (uuid, pk)
- email (unique)
- password_hash
- created_at, updated_at

## profiles
- id (uuid, pk)
- user_id (fk users.id)
- experience_level (enum: junior/mid/senior)
- target_role (string)
- technologies (jsonb array)
- preferences (jsonb)

## interview_sessions
- id (uuid, pk)
- user_id (fk users.id)
- status (enum: pending/in_progress/completed/failed)
- started_at, ended_at
- config (jsonb: mode, difficulty, topics)

## interview_messages
- id (uuid, pk)
- session_id (fk interview_sessions.id)
- role (enum: user/assistant/system)
- content (text)
- created_at
- metadata (jsonb: stt_confidence, latency_ms)

## emotion_snapshots
- id (uuid, pk)
- session_id (fk interview_sessions.id)
- captured_at
- emotion (enum: stress/fear/confidence/neutral)
- confidence (float)

## code_runs
- id (uuid, pk)
- session_id (fk interview_sessions.id)
- language (string)
- source_code (text)
- stdout, stderr (text)
- exit_code (int)
- executed_at

## interview_reports
- id (uuid, pk)
- session_id (fk interview_sessions.id)
- report_json (jsonb)
- created_at
