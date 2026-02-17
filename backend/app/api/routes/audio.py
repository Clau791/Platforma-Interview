from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.schemas.audio import AudioResponse
from app.services.audio_service import process_audio
from app.utils.jwt import get_current_user


router = APIRouter()


@router.post("/{session_id}/audio", response_model=AudioResponse)
async def upload_audio(
    session_id: str,
    audio: UploadFile = File(...),
    ai_provider: str | None = Form(default=None),
    ai_model: str | None = Form(default=None),
    ai_tts_model: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    audio_bytes = await audio.read()
    ctx = {"session_id": str(session.id)}
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if profile and profile.preferences:
        ctx.update(profile.preferences)
    if ai_provider:
        ctx["ai_provider"] = ai_provider
    if ai_model:
        ctx["ai_model"] = ai_model
    if ai_tts_model:
        ctx["ai_tts_model"] = ai_tts_model
    result = await process_audio(audio_bytes, context=ctx)
    return result
