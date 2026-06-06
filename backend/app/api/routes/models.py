import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.profile import Profile
from app.utils.jwt import get_current_user
from app.services import ai_client


router = APIRouter()


class ValidateModelsPayload(BaseModel):
    api_key: str | None = None
    limit: int = Field(default=100, ge=1, le=200)


class ProbeGeminiVoicesPayload(BaseModel):
    api_key: str | None = None
    model: str | None = None
    sample_text: str = Field(default="Bună! Acesta este un test scurt de voce.")
    voices: list[str] | None = None


def _raise_provider_http_error(provider: str, exc: httpx.HTTPStatusError) -> None:
    response = exc.response
    detail = f"{provider} API error ({response.status_code})"
    try:
        payload = response.json()
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                message = error.get("message") or error.get("status")
                if message:
                    detail = f"{detail}: {message}"
            elif isinstance(error, str) and error.strip():
                detail = f"{detail}: {error.strip()}"
            elif payload.get("message"):
                detail = f"{detail}: {payload['message']}"
    except Exception:
        text = (response.text or "").strip()
        if text:
            detail = f"{detail}: {text[:300]}"

    status_code = 400 if 400 <= response.status_code < 500 else 502
    raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/models")
async def list_models(
    provider: str = Query("gemini", pattern="^(gemini)$"),
    limit: int | None = Query(None, ge=1, le=200),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    prefs = profile.preferences if profile and profile.preferences else {}
    user_key = prefs.get("geminiApiKey")
    try:
        models = await ai_client.list_available_models(provider=provider, limit=limit, api_key=user_key)
    except ai_client.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        _raise_provider_http_error(provider, exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not list models") from exc

    return {"provider": provider, "models": models}


@router.post("/models/validate")
async def validate_and_cache_models(
    provider: str = Query("gemini", pattern="^(gemini)$"),
    payload: ValidateModelsPayload | None = Body(default=None),
    api_key: str | None = Query(default=None),
    limit: int | None = Query(None, ge=1, le=200),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    resolved_api_key = payload.api_key if payload and payload.api_key is not None else api_key
    resolved_limit = payload.limit if payload else (limit or 100)

    try:
        models = await ai_client.list_available_models(
            provider=provider,
            limit=resolved_limit,
            api_key=resolved_api_key,
        )
    except ai_client.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        _raise_provider_http_error(provider, exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not validate key") from exc

    prefs = profile.preferences or {}
    available = prefs.get("availableModels", {})
    available[provider] = models
    prefs["availableModels"] = available
    prefs["aiProvider"] = "gemini"
    if models:
        current_model = prefs.get("aiModel")
        if not current_model or current_model not in models:
            prefs["aiModel"] = models[0]
    if not prefs.get("aiTtsModel"):
        prefs["aiTtsModel"] = ai_client.GEMINI_DEFAULT_TTS_MODEL
    if resolved_api_key:
        prefs["geminiApiKey"] = resolved_api_key
    profile.preferences = prefs
    db.add(profile)
    db.commit()
    db.refresh(profile)

    return {
        "provider": provider,
        "models": models,
        "cached": True,
        "selected_model": prefs.get("aiModel"),
        "selected_tts_model": prefs.get("aiTtsModel"),
    }


@router.get("/models/gemini/voices")
async def list_gemini_voices():
    return {"provider": "gemini", "voices": ai_client.GEMINI_TTS_VOICES}


@router.post("/models/gemini/voices/probe")
async def probe_gemini_voices(
    payload: ProbeGeminiVoicesPayload,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    prefs = profile.preferences if profile and profile.preferences else {}
    key = payload.api_key or prefs.get("geminiApiKey")
    context = {"geminiApiKey": key} if key else {}
    try:
        results = await ai_client.probe_gemini_voices(
            context=context,
            api_key=key,
            model=payload.model,
            sample_text=payload.sample_text,
            voices=payload.voices,
        )
    except ai_client.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Voice probe failed: {exc}") from exc

    return {
        "provider": "gemini",
        "model": payload.model or ai_client.GEMINI_DEFAULT_TTS_MODEL,
        "count": len(results),
        "results": results,
    }
