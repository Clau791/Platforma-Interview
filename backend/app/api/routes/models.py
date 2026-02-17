import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.profile import Profile
from app.utils.jwt import get_current_user
from app.services import ai_client


router = APIRouter()


@router.get("/models")
async def list_models(
    provider: str = Query("openai", pattern="^(openai|gemini)$"),
    limit: int | None = Query(None, ge=1, le=200),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    prefs = profile.preferences if profile and profile.preferences else {}
    user_key = None
    if provider == "openai":
        user_key = prefs.get("openaiApiKey")
    elif provider == "gemini":
        user_key = prefs.get("geminiApiKey")
    try:
        models = await ai_client.list_available_models(provider=provider, limit=limit, api_key=user_key)
    except ai_client.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"{provider} API error") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Could not list models") from exc

    return {"provider": provider, "models": models}


@router.post("/models/validate")
async def validate_and_cache_models(
    provider: str = Query("openai", pattern="^(openai|gemini)$"),
    api_key: str | None = Query(default=None),
    limit: int | None = Query(None, ge=1, le=200),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        models = await ai_client.list_available_models(provider=provider, limit=limit, api_key=api_key)
    except ai_client.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"{provider} API error") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Could not validate key") from exc

    prefs = profile.preferences or {}
    available = prefs.get("availableModels", {})
    available[provider] = models
    prefs["availableModels"] = available
    # if key provided, persist key to preferences for future calls
    if provider == "openai" and api_key:
        prefs["openaiApiKey"] = api_key
    if provider == "gemini" and api_key:
        prefs["geminiApiKey"] = api_key
    profile.preferences = prefs
    db.add(profile)
    db.commit()
    db.refresh(profile)

    return {"provider": provider, "models": models, "cached": True}
