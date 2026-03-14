import logging
import time
from datetime import datetime

from app.services import ai_client
from app.utils.errors import AppError


logger = logging.getLogger(__name__)


def _fallback_response(latency_ms: int, reason: str | None = None) -> dict:
    message = reason or "Pipeline-ul audio nu este configurat."
    return {
        "transcript": "",
        "assistant_text": message,
        "tts_audio_url": None,
        "latency_ms": latency_ms,
    }


def _build_welcome_text(context: dict | None = None) -> str:
    context = context or {}
    name = (context.get("full_name") or "candidat").strip() or "candidat"
    templates = [
        "Bună, {name}! Ce mai faci astăzi? Hai să începem cu o scurtă prezentare.",
        "Salut, {name}! Bine ai venit la simularea de interviu. Spune-mi pe scurt cine ești.",
        "Bună, {name}! Începem cu o întrebare comportamentală, apoi trecem la partea tehnică.",
    ]
    idx = datetime.utcnow().minute % len(templates)
    return templates[idx].format(name=name)


async def process_welcome(context: dict | None = None) -> dict:
    start = time.perf_counter()
    assistant_text = _build_welcome_text(context)
    tts_audio_url = None
    provider = (context or {}).get("ai_provider") or (context or {}).get("aiProvider") or "openai"
    model = (context or {}).get("ai_model") or (context or {}).get("aiModel")
    runtime_debug = ai_client.runtime_audio_debug(context)
    logger.info("process_welcome provider=%s model=%s runtime=%s", provider, model or "-", runtime_debug)
    try:
        tts_audio_url = await ai_client.synthesize_speech(assistant_text, context)
    except AppError as exc:
        # Keep text greeting even if TTS fails.
        logger.warning("Welcome TTS unavailable: %s", exc)
        tts_audio_url = None

    latency_ms = int((time.perf_counter() - start) * 1000)
    return {
        "transcript": "",
        "assistant_text": assistant_text,
        "tts_audio_url": tts_audio_url,
        "latency_ms": latency_ms,
    }


async def process_audio(audio_bytes: bytes, context: dict | None = None) -> dict:
    start = time.perf_counter()
    transcript = ""
    transcription_error: AppError | None = None
    provider = (context or {}).get("ai_provider") or (context or {}).get("aiProvider") or "openai"
    model = (context or {}).get("ai_model") or (context or {}).get("aiModel")
    session_id = (context or {}).get("session_id")
    runtime_debug = ai_client.runtime_audio_debug(context)
    logger.info(
        "process_audio session=%s provider=%s model=%s bytes=%s runtime=%s",
        session_id or "-",
        provider,
        model or "-",
        len(audio_bytes) if audio_bytes else 0,
        runtime_debug,
    )

    try:
        transcript = await ai_client.transcribe_audio(audio_bytes, context)
        logger.info("process_audio transcript_len=%s transcript_preview=%s", len(transcript), transcript[:120])
    except AppError as exc:
        transcription_error = exc
        logger.warning("Transcription unavailable, continuing interview flow: %s", exc)

    prompt_for_reply = transcript.strip()
    if not prompt_for_reply:
        prompt_for_reply = (
            "Candidatul nu a oferit încă un răspuns clar în audio. "
            "Pune următoarea întrebare scurtă de interviu, în limba română."
        )

    try:
        assistant_text = await ai_client.generate_reply(prompt_for_reply, context)
        if not assistant_text.strip():
            assistant_text = (
                "Te rog spune-mi pe scurt experiența ta și proiectul de care ești cel mai mândru."
            )
        logger.info("process_audio assistant_len=%s", len(assistant_text))
    except AppError as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        reason = str(exc)
        if transcription_error is not None:
            reason = f"{reason}. Detaliu STT: {transcription_error}"
        logger.warning("Audio pipeline fallback: %s", exc)
        return _fallback_response(latency_ms, reason)

    tts_audio_url = None
    try:
        tts_audio_url = await ai_client.synthesize_speech(assistant_text, context)
        logger.info("process_audio tts_ok=%s", bool(tts_audio_url))
    except AppError as exc:
        # Keep text response if TTS fails.
        logger.warning("TTS unavailable for assistant reply: %s", exc)
        tts_audio_url = None

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info("process_audio done latency_ms=%s", latency_ms)
    return {
        "transcript": transcript,
        "assistant_text": assistant_text,
        "tts_audio_url": tts_audio_url,
        "latency_ms": latency_ms,
    }
