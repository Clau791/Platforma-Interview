import base64
import io
import json
import logging
import re
import wave

import httpx
from openai import AsyncOpenAI

from app.core.config import settings
from app.utils.errors import AppError


logger = logging.getLogger(__name__)
PLACEHOLDER_API_KEYS = {"change_me", "your_api_key", "your_api_key_here"}
GEMINI_DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts"
GEMINI_TTS_VOICES = [
    "Zephyr",
    "Puck",
    "Charon",
    "Kore",
    "Fenrir",
    "Leda",
    "Orus",
    "Aoede",
    "Callirrhoe",
    "Autonoe",
    "Enceladus",
    "Iapetus",
    "Umbriel",
    "Algieba",
    "Despina",
    "Erinome",
    "Algenib",
    "Rasalgethi",
    "Laomedeia",
    "Achernar",
    "Alnilam",
    "Schedar",
    "Gacrux",
    "Pulcherrima",
    "Achird",
    "Zubenelgenubi",
    "Vindemiatrix",
    "Sadachbia",
    "Sadaltager",
    "Sulafat",
]


def _context_value(context: dict | None, *keys: str) -> str | None:
    if not context:
        return None
    for key in keys:
        value = context.get(key)
        if value:
            return str(value)
    return None


def _sanitize_api_key(value: str | None) -> str | None:
    if not value:
        return None
    key = str(value).strip()
    if not key:
        return None
    if key.lower() in PLACEHOLDER_API_KEYS:
        return None
    return key


def _resolve_openai_api_key(context: dict | None = None) -> str | None:
    return _sanitize_api_key(_context_value(context, "openaiApiKey", "openai_api_key")) or _sanitize_api_key(
        settings.openai_api_key
    )


def _resolve_gemini_api_key(context: dict | None = None) -> str | None:
    return _sanitize_api_key(_context_value(context, "geminiApiKey", "gemini_api_key")) or _sanitize_api_key(
        settings.gemini_api_key
    )


def _extract_rate_from_mime(mime_type: str, default_rate: int = 24000) -> int:
    match = re.search(r"rate=(\d+)", mime_type or "", re.IGNORECASE)
    if not match:
        return default_rate
    try:
        return int(match.group(1))
    except ValueError:
        return default_rate


def _pcm16_to_wav_bytes(pcm_bytes: bytes, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)
    return buffer.getvalue()


def _resolve_gemini_tts_model(context: dict | None = None) -> str:
    model = _context_value(context, "aiTtsModel", "ai_tts_model")
    if model:
        return model
    return GEMINI_DEFAULT_TTS_MODEL


def _resolve_gemini_voice(context: dict | None = None) -> str:
    voice_pref = _context_value(context, "ttsVoice", "tts_voice")
    if voice_pref:
        return voice_pref
    gender = _context_value(context, "voiceGender", "voice_gender", "interviewGender") or "female"
    return "Puck" if str(gender).lower() == "male" else "Kore"


def _normalize_gemini_model_name(name: str) -> str:
    if name.startswith("models/"):
        return name
    return f"models/{name}"


def _is_gemini_native_model(model_name: str | None) -> bool:
    lowered = (model_name or "").lower()
    return (
        "native-audio" in lowered
        or "native_audio" in lowered
        or "native-dialog" in lowered
        or "native_dialog" in lowered
    )


def runtime_audio_debug(context: dict | None = None) -> dict:
    provider = (_context_value(context, "ai_provider", "aiProvider") or settings.ai_provider or "openai").lower()
    ai_model = _context_value(context, "ai_model", "aiModel")
    ai_tts_model = _context_value(context, "ai_tts_model", "aiTtsModel")
    tts_voice = _context_value(context, "ttsVoice", "tts_voice")
    voice_gender = _context_value(context, "voiceGender", "voice_gender")
    interview_gender = _context_value(context, "interviewGender", "interview_gender")

    if provider == "gemini":
        resolved_model = ai_model or settings.gemini_model
        resolved_tts_model = ai_tts_model or GEMINI_DEFAULT_TTS_MODEL
        resolved_voice = tts_voice or _resolve_gemini_voice(context)
    else:
        resolved_model = ai_model or settings.openai_model
        resolved_tts_model = ai_tts_model or settings.openai_tts_model
        resolved_voice = tts_voice or settings.openai_tts_voice

    debug_payload = {
        "provider": provider,
        "ai_model": resolved_model,
        "ai_tts_model": resolved_tts_model,
        "tts_voice": resolved_voice,
        "voice_gender": voice_gender,
        "interview_gender": interview_gender,
        "has_openai_key": bool(_resolve_openai_api_key(context)),
        "has_gemini_key": bool(_resolve_gemini_api_key(context)),
        "is_gemini_native_model": _is_gemini_native_model(resolved_model),
    }
    logger.debug("runtime_audio_debug=%s", debug_payload)
    return debug_payload


async def _gemini_generate_content(
    model_name: str,
    payload: dict,
    *,
    context: dict | None = None,
    timeout_seconds: int | None = None,
) -> dict:
    gemini_key = _resolve_gemini_api_key(context)
    if not gemini_key:
        raise AppError("Gemini API key not configured", code="gemini_missing_key")

    model = _normalize_gemini_model_name(model_name)
    url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent"
    params = {"key": gemini_key}
    timeout = timeout_seconds or settings.openai_timeout_seconds

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, params=params, json=payload)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:  # noqa: BLE001
        detail = exc.response.text.strip() if exc.response is not None else str(exc)
        raise AppError(f"Gemini request failed: {detail}", code="gemini_failed") from exc
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"Gemini request failed: {exc}", code="gemini_failed") from exc


async def list_available_models(provider: str, limit: int | None = None, api_key: str | None = None) -> list[str]:
    provider = provider.lower()
    if provider == "openai":
        key = _sanitize_api_key(api_key) or _sanitize_api_key(settings.openai_api_key)
        if not key:
            raise AppError("OpenAI API key not configured", code="openai_missing_key")
        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {key}"}
        params = {"limit": limit or 100}
        async with httpx.AsyncClient(timeout=settings.openai_timeout_seconds) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            models = data.get("data", [])
            names = []
            for item in models:
                name = item.get("id")
                owner = item.get("owned_by") or ""
                if owner.startswith("openai") and name and name.startswith("gpt"):
                    names.append(name)
            names = sorted(set(names))
            return names if limit is None else names[:limit]
    if provider == "gemini":
        key = _sanitize_api_key(api_key) or _sanitize_api_key(settings.gemini_api_key)
        if not key:
            raise AppError("Gemini API key not configured", code="gemini_missing_key")
        url = "https://generativelanguage.googleapis.com/v1beta/models"
        params = {"key": key, "pageSize": 100}
        collected: list[dict] = []
        async with httpx.AsyncClient(timeout=settings.openai_timeout_seconds) as client:
            while True:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                collected.extend(data.get("models", []))
                next_page_token = data.get("nextPageToken")
                if not next_page_token:
                    break
                if limit is not None and len(collected) >= limit * 2:
                    # Continue enough to keep filtered results meaningful, but avoid unbounded pagination.
                    break
                params["pageToken"] = next_page_token

            names = []
            for m in collected:
                name = m.get("name")
                if not name:
                    continue
                # Keep only native dialog/audio Gemini models.
                if _is_gemini_native_model(name):
                    names.append(name)
            names = sorted(set(names), key=lambda x: (0 if "latest" in x else 1, x))
            return names if limit is None else names[:limit]
    raise AppError("Unsupported provider", code="invalid_provider")


def _build_system_prompt(context: dict | None) -> str:
    base_prompt = (
        "You are AI Interview Coach, a senior interviewer focused on helping students "
        "practice realistic interviews. Ask clear, structured questions and adapt tone "
        "based on candidate signals. Keep responses concise."
    )
    persona = []
    if context:
        gender = context.get("interviewGender") or context.get("voiceGender")
        if gender:
            persona.append(f"Use a {gender} interviewer persona and consistent style.")
    if persona:
        base_prompt = base_prompt + " " + " ".join(persona)
    if not context:
        return base_prompt
    context_json = json.dumps(context, ensure_ascii=True)
    return f"{base_prompt}\nContext: {context_json}"


def _openai_client(context: dict | None = None) -> AsyncOpenAI:
    openai_key = _resolve_openai_api_key(context)
    if not openai_key:
        raise AppError("OpenAI API key not configured", code="openai_missing_key")
    return AsyncOpenAI(
        api_key=openai_key,
        timeout=settings.openai_timeout_seconds,
    )


async def _transcribe_audio_openai(audio_bytes: bytes, context: dict | None = None) -> str:
    if not audio_bytes:
        raise AppError("Audio payload is empty", code="empty_audio")

    client = _openai_client(context)
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "audio.webm"
    try:
        response = await client.audio.transcriptions.create(
            model=settings.openai_whisper_model,
            file=audio_file,
        )
    except Exception as exc:  # noqa: BLE001
        raise AppError("STT request failed", code="stt_failed") from exc

    text = getattr(response, "text", "")
    return text or ""


async def _transcribe_audio_gemini(audio_bytes: bytes, context: dict | None = None) -> str:
    if not audio_bytes:
        raise AppError("Audio payload is empty", code="empty_audio")

    model = _context_value(context, "aiModel", "ai_model") or settings.gemini_model
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": "Transcrie exact audio-ul în limba română. Returnează doar textul brut."},
                    {
                        "inlineData": {
                            "mimeType": "audio/webm",
                            "data": base64.b64encode(audio_bytes).decode("ascii"),
                        }
                    },
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
        },
    }
    data = await _gemini_generate_content(model, payload, context=context, timeout_seconds=45)
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text_chunks = [str(part.get("text", "")).strip() for part in parts if part.get("text")]
    return "\n".join([chunk for chunk in text_chunks if chunk]).strip()


async def transcribe_audio(audio_bytes: bytes, context: dict | None = None) -> str:
    provider = (_context_value(context, "ai_provider", "aiProvider") or settings.ai_provider or "openai").lower()
    if provider == "gemini":
        return await _transcribe_audio_gemini(audio_bytes, context)
    return await _transcribe_audio_openai(audio_bytes, context)


async def _call_openai(messages: list[dict], model: str, context: dict | None = None) -> str:
    client = _openai_client(context)
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
            max_tokens=300,
        )
    except Exception as exc:  # noqa: BLE001
        raise AppError("LLM request failed", code="llm_failed") from exc

    content = response.choices[0].message.content if response.choices else ""
    return (content or "").strip()


async def _call_gemini(prompt: str, context_prompt: str, model_name: str, context: dict | None = None) -> str:
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": context_prompt},
                    {"text": prompt},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
        },
    }
    data = await _gemini_generate_content(model_name, payload, context=context)

    candidates = data.get("candidates") or []
    if not candidates:
        raise AppError("Gemini returned no candidates", code="gemini_no_result")

    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text_chunks = [str(part.get("text", "")).strip() for part in parts if part.get("text")]
    text = "\n".join([chunk for chunk in text_chunks if chunk]).strip()
    if not text:
        raise AppError("Gemini response empty", code="gemini_empty")
    return text


async def generate_reply(user_text: str, context: dict | None = None) -> str:
    prompt = user_text.strip() or "Start the interview and ask the first question."
    context_prompt = _build_system_prompt(context)
    provider = (context or {}).get("ai_provider") or settings.ai_provider
    ai_model = (context or {}).get("aiModel") or (context or {}).get("ai_model")
    if provider.lower() == "gemini":
        model = ai_model or settings.gemini_model
        return await _call_gemini(prompt, context_prompt, model_name=model, context=context)

    messages = [
        {"role": "system", "content": context_prompt},
        {"role": "user", "content": prompt},
    ]
    model = ai_model or settings.openai_model
    return await _call_openai(messages, model=model, context=context)


async def _synthesize_speech_openai(text: str, context: dict | None = None) -> str:
    if not text.strip():
        raise AppError("No text to synthesize", code="tts_empty_text")

    client = _openai_client(context)
    voice = settings.openai_tts_voice
    tts_model = (context or {}).get("aiTtsModel") or (context or {}).get("ai_tts_model") or settings.openai_tts_model
    if context:
        gender = context.get("voiceGender") or context.get("voice_gender") or context.get("interviewGender")
        voice_pref = context.get("ttsVoice") or context.get("tts_voice")
        if voice_pref:
            voice = voice_pref
        elif gender:
            mapped = {"female": "nova", "male": "onyx"}
            voice = mapped.get(str(gender).lower(), voice)
    try:
        response = await client.audio.speech.create(
            model=tts_model,
            voice=voice,
            input=text,
            response_format="mp3",
        )
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"TTS request failed: {exc}", code="tts_failed") from exc

    audio_bytes = getattr(response, "content", None)
    if not audio_bytes:
        raise AppError("TTS response empty", code="tts_empty_response")

    encoded = base64.b64encode(audio_bytes).decode("ascii")
    return f"data:audio/mpeg;base64,{encoded}"


async def _synthesize_speech_gemini(text: str, context: dict | None = None) -> str:
    if not text.strip():
        raise AppError("No text to synthesize", code="tts_empty_text")

    model = _resolve_gemini_tts_model(context)
    voice = _resolve_gemini_voice(context)
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": text}],
            }
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice,
                    }
                }
            },
        },
    }
    data = await _gemini_generate_content(model, payload, context=context, timeout_seconds=45)
    candidates = data.get("candidates") or []
    if not candidates:
        raise AppError("Gemini returned no audio candidates", code="gemini_no_audio")
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    inline = None
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline:
            break
    if not inline:
        raise AppError("Gemini response does not contain audio", code="gemini_no_audio_data")
    encoded_audio = inline.get("data")
    if not encoded_audio:
        raise AppError("Gemini response audio is empty", code="gemini_audio_empty")

    mime_type = inline.get("mimeType") or inline.get("mime_type") or "audio/L16;rate=24000"
    audio_bytes = base64.b64decode(encoded_audio)

    lowered_mime = mime_type.lower()
    if "audio/mpeg" in lowered_mime or "audio/mp3" in lowered_mime:
        return f"data:audio/mpeg;base64,{encoded_audio}"
    if "audio/wav" in lowered_mime or "audio/x-wav" in lowered_mime:
        return f"data:audio/wav;base64,{encoded_audio}"

    # Gemini TTS usually returns PCM; wrap it as WAV for browser playback.
    sample_rate = _extract_rate_from_mime(mime_type, default_rate=24000)
    wav_bytes = _pcm16_to_wav_bytes(audio_bytes, sample_rate=sample_rate)
    encoded_wav = base64.b64encode(wav_bytes).decode("ascii")
    return f"data:audio/wav;base64,{encoded_wav}"


async def synthesize_speech(text: str, context: dict | None = None) -> str:
    provider = (_context_value(context, "ai_provider", "aiProvider") or settings.ai_provider or "openai").lower()
    if provider == "gemini":
        return await _synthesize_speech_gemini(text, context)
    return await _synthesize_speech_openai(text, context)


async def probe_gemini_voices(
    *,
    context: dict | None = None,
    api_key: str | None = None,
    model: str | None = None,
    sample_text: str = "Bună! Acesta este un test scurt de voce.",
    voices: list[str] | None = None,
) -> list[dict]:
    # Allow endpoint caller to override key without persisting in context object.
    test_context = dict(context or {})
    if api_key:
        test_context["geminiApiKey"] = api_key
    tts_model = model or _resolve_gemini_tts_model(test_context)
    to_test = voices or GEMINI_TTS_VOICES

    results = []
    for voice in to_test:
        payload = {
            "contents": [{"role": "user", "parts": [{"text": sample_text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": voice,
                        }
                    }
                },
            },
        }
        try:
            data = await _gemini_generate_content(tts_model, payload, context=test_context, timeout_seconds=45)
            candidates = data.get("candidates") or []
            ok = False
            for candidate in candidates:
                content = candidate.get("content") or {}
                parts = content.get("parts") or []
                if any((part.get("inlineData") or part.get("inline_data")) for part in parts):
                    ok = True
                    break
            results.append({"voice": voice, "available": ok, "error": None})
        except Exception as exc:  # noqa: BLE001
            results.append({"voice": voice, "available": False, "error": str(exc)})

    return results
