import time

from app.services import ai_client
from app.utils.errors import AppError


def _fallback_response(latency_ms: int) -> dict:
    return {
        "transcript": "",
        "assistant_text": "Audio pipeline not configured.",
        "tts_audio_url": None,
        "latency_ms": latency_ms,
    }


async def process_audio(audio_bytes: bytes, context: dict | None = None) -> dict:
    start = time.perf_counter()
    try:
        transcript = await ai_client.transcribe_audio(audio_bytes)
        assistant_text = await ai_client.generate_reply(transcript, context)
        tts_audio_url = await ai_client.synthesize_speech(assistant_text, context)
    except AppError:
        latency_ms = int((time.perf_counter() - start) * 1000)
        return _fallback_response(latency_ms)

    latency_ms = int((time.perf_counter() - start) * 1000)
    return {
        "transcript": transcript,
        "assistant_text": assistant_text,
        "tts_audio_url": tts_audio_url,
        "latency_ms": latency_ms,
    }
