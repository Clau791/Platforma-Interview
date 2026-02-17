import base64
import io
import json
import asyncio

import httpx
from openai import AsyncOpenAI

from app.core.config import settings
from app.utils.errors import AppError


async def list_available_models(provider: str, limit: int | None = None, api_key: str | None = None) -> list[str]:
    provider = provider.lower()
    if provider == "openai":
        key = api_key or settings.openai_api_key
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
            return names if limit is None else names[:limit]
    if provider == "gemini":
        key = api_key or settings.gemini_api_key
        if not key:
            raise AppError("Gemini API key not configured", code="gemini_missing_key")
        url = "https://generativelanguage.googleapis.com/v1beta/models"
        params = {"key": key, "pageSize": limit or 100}
        async with httpx.AsyncClient(timeout=settings.openai_timeout_seconds) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            models = data.get("models", [])
            names = []
            for m in models:
                name = m.get("name")
                if name and ("flash" in name or "pro" in name):
                    names.append(name)
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


def _openai_client() -> AsyncOpenAI:
    if not settings.openai_api_key:
        raise AppError("OpenAI API key not configured", code="openai_missing_key")
    return AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=settings.openai_timeout_seconds,
    )


async def transcribe_audio(audio_bytes: bytes) -> str:
    if not audio_bytes:
        raise AppError("Audio payload is empty", code="empty_audio")

    client = _openai_client()
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


async def _call_openai(messages: list[dict], model: str) -> str:
    client = _openai_client()
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


async def _call_gemini(prompt: str, context_prompt: str, model_name: str) -> str:
    if not settings.gemini_api_key:
        raise AppError("Gemini API key not configured", code="gemini_missing_key")

    payload = {
        "prompt": {
            "messages": [
                {"role": "SYSTEM", "content": [{"text": context_prompt}]},
                {"role": "HUMAN", "content": [{"text": prompt}]},
            ]
        },
        "temperature": 0.3,
        "candidateCount": 1,
    }

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateText"
    )
    params = {"key": settings.gemini_api_key}
    try:
        async with httpx.AsyncClient(timeout=settings.openai_timeout_seconds) as client:
            response = await client.post(url, params=params, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:  # noqa: BLE001
        raise AppError("Gemini request failed", code="gemini_failed") from exc
    except Exception as exc:  # noqa: BLE001
        raise AppError("Gemini request failed", code="gemini_failed") from exc

    candidates = data.get("candidates") or []
    if not candidates:
        raise AppError("Gemini returned no candidates", code="gemini_no_result")

    sections = candidates[0].get("content", [])
    if not sections:
        raise AppError("Gemini response empty", code="gemini_empty")
    text = sections[0].get("text", "")
    return text.strip()


async def generate_reply(user_text: str, context: dict | None = None) -> str:
    prompt = user_text.strip() or "Start the interview and ask the first question."
    context_prompt = _build_system_prompt(context)
    provider = (context or {}).get("ai_provider") or settings.ai_provider
    ai_model = (context or {}).get("aiModel") or (context or {}).get("ai_model")
    if provider.lower() == "gemini":
        model = ai_model or settings.gemini_model
        return await _call_gemini(prompt, context_prompt, model_name=model)

    messages = [
        {"role": "system", "content": context_prompt},
        {"role": "user", "content": prompt},
    ]
    model = ai_model or settings.openai_model
    return await _call_openai(messages, model=model)


async def synthesize_speech(text: str, context: dict | None = None) -> str:
    if not text.strip():
        raise AppError("No text to synthesize", code="tts_empty_text")

    client = _openai_client()
    voice = settings.openai_tts_voice
    tts_model = (context or {}).get("aiTtsModel") or (context or {}).get("ai_tts_model") or settings.openai_tts_model
    if context:
        gender = context.get("interviewGender") or context.get("voiceGender") or context.get("voice_gender")
        voice_pref = context.get("tts_voice")
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
        raise AppError("TTS request failed", code="tts_failed") from exc

    audio_bytes = getattr(response, "content", None)
    if not audio_bytes:
        raise AppError("TTS response empty", code="tts_empty_response")

    encoded = base64.b64encode(audio_bytes).decode("ascii")
    return f"data:audio/mpeg;base64,{encoded}"
