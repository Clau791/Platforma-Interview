import json
import logging

import httpx

from app.core.config import settings
from app.utils.errors import AppError


logger = logging.getLogger(__name__)
PLACEHOLDER_API_KEYS = {"change_me", "your_api_key", "your_api_key_here"}
GEMINI_DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts"
GEMINI_TTS_VOICES = [
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
    "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
    "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
    "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird",
    "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
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
    if not key or key.lower() in PLACEHOLDER_API_KEYS:
        return None
    return key


def _resolve_gemini_api_key(context: dict | None = None) -> str | None:
    return _sanitize_api_key(_context_value(context, "geminiApiKey", "gemini_api_key")) or _sanitize_api_key(
        settings.gemini_api_key
    )


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


def _resolve_gemini_tts_model(context: dict | None = None) -> str:
    model = _context_value(context, "aiTtsModel", "ai_tts_model")
    return model or GEMINI_DEFAULT_TTS_MODEL


def _resolve_gemini_voice(context: dict | None = None) -> str:
    voice_pref = _context_value(context, "ttsVoice", "tts_voice")
    if voice_pref:
        return voice_pref
    gender = _context_value(context, "voiceGender", "voice_gender", "interviewGender") or "female"
    return "Puck" if str(gender).lower() == "male" else "Kore"


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
    timeout = timeout_seconds or 20

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, params=params, json=payload)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip() if exc.response is not None else str(exc)
        raise AppError(f"Gemini request failed: {detail}", code="gemini_failed") from exc
    except Exception as exc:
        raise AppError(f"Gemini request failed: {exc}", code="gemini_failed") from exc


async def list_available_models(provider: str, limit: int | None = None, api_key: str | None = None) -> list[str]:
    provider = provider.lower()
    if provider == "gemini":
        key = _sanitize_api_key(api_key) or _sanitize_api_key(settings.gemini_api_key)
        if not key:
            raise AppError("Gemini API key not configured", code="gemini_missing_key")
        url = "https://generativelanguage.googleapis.com/v1beta/models"
        params = {"key": key, "pageSize": 100}
        collected: list[dict] = []
        async with httpx.AsyncClient(timeout=20) as client:
            while True:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                collected.extend(data.get("models", []))
                next_page_token = data.get("nextPageToken")
                if not next_page_token:
                    break
                if limit is not None and len(collected) >= limit * 2:
                    break
                params["pageToken"] = next_page_token

            names = []
            for m in collected:
                name = m.get("name")
                if not name:
                    continue
                if _is_gemini_native_model(name):
                    names.append(name)
            names = sorted(set(names), key=lambda x: (0 if "latest" in x else 1, x))
            return names if limit is None else names[:limit]
    raise AppError("Unsupported provider. Only 'gemini' is supported.", code="invalid_provider")


async def generate_reply(prompt: str, context: dict | None = None) -> str:
    """Generate a text reply using Gemini."""
    text = prompt.strip() or "Start the interview and ask the first question."
    system_prompt = _build_system_prompt(context)
    model = _context_value(context, "aiModel", "ai_model") or settings.gemini_model

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": system_prompt},
                    {"text": text},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
        },
    }
    data = await _gemini_generate_content(model, payload, context=context)

    candidates = data.get("candidates") or []
    if not candidates:
        raise AppError("Gemini returned no candidates", code="gemini_no_result")

    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text_chunks = [str(part.get("text", "")).strip() for part in parts if part.get("text")]
    result = "\n".join([chunk for chunk in text_chunks if chunk]).strip()
    if not result:
        raise AppError("Gemini response empty", code="gemini_empty")
    return result


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


async def probe_gemini_voices(
    *,
    context: dict | None = None,
    api_key: str | None = None,
    model: str | None = None,
    sample_text: str = "Bună! Acesta este un test scurt de voce.",
    voices: list[str] | None = None,
) -> list[dict]:
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
        except Exception as exc:
            results.append({"voice": voice, "available": False, "error": str(exc)})

    return results
