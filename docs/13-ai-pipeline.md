# AI Pipeline (STT/LLM/TTS)

## Components
- STT: OpenAI Whisper (audio -> text)
- LLM: OpenAI chat completion (text -> response)
- TTS: OpenAI speech (text -> audio)

## Backend entrypoints
- app/services/ai_client.py
- app/services/audio_service.py

## Flow
1. Receive audio bytes from /sessions/{id}/audio.
2. STT: transcribe_audio -> transcript.
3. LLM: generate_reply with system prompt + context.
4. TTS: synthesize_speech -> base64 data URL (audio/mpeg).

## Emotion pipeline
- Frames are decoded via OpenCV and passed to DeepFace (detector_backend=opencv).
- Emotions are mapped to `stress`, `fear`, `confidence`, or `neutral` using heuristic thresholds.
- Results include `emotion` + `confidence` (rounded) and feed system context during the voice loop.

## Configuration (.env)
- OPENAI_API_KEY
- OPENAI_MODEL
- OPENAI_WHISPER_MODEL
- OPENAI_TTS_MODEL
- OPENAI_TTS_VOICE
- OPENAI_TIMEOUT_SECONDS

## Error handling
- Missing API key -> openai_missing_key.
- API failures -> stt_failed / llm_failed / tts_failed.
- Empty payloads -> empty_audio / tts_empty_text.
- Emotion detection issues -> emotion_failed.

## Output
- tts_audio_url is a data URL that can be played directly in the browser.
