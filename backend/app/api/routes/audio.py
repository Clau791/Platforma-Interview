import json
import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, get_db
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.schemas.audio import AudioResponse
from app.services.audio_service import process_audio, process_welcome
from app.utils.jwt import get_current_user, get_user_from_token


router = APIRouter()
logger = logging.getLogger(__name__)


def _normalize_session_id(session_id: str) -> str:
    try:
        return str(UUID(session_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid session id") from exc


def _build_audio_context(
    db: Session,
    current_user,
    session: InterviewSession,
    ai_provider: str | None = None,
    ai_model: str | None = None,
    ai_tts_model: str | None = None,
    tts_voice: str | None = None,
    voice_gender: str | None = None,
    interview_gender: str | None = None,
    full_name: str | None = None,
) -> dict:
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
    if tts_voice:
        ctx["ttsVoice"] = tts_voice
    if voice_gender:
        ctx["voiceGender"] = voice_gender
    if interview_gender:
        ctx["interviewGender"] = interview_gender
    if full_name:
        ctx["full_name"] = full_name
    return ctx


@router.post("/{session_id}/audio", response_model=AudioResponse)
async def upload_audio(
    session_id: str,
    audio: UploadFile = File(...),
    ai_provider: str | None = Form(default=None),
    ai_model: str | None = Form(default=None),
    ai_tts_model: str | None = Form(default=None),
    tts_voice: str | None = Form(default=None),
    voice_gender: str | None = Form(default=None),
    interview_gender: str | None = Form(default=None),
    full_name: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session_id = _normalize_session_id(session_id)
    logger.info(
        "upload_audio http session=%s provider=%s model=%s tts_model=%s tts_voice=%s voice_gender=%s interview_gender=%s",
        session_id,
        ai_provider or "-",
        ai_model or "-",
        ai_tts_model or "-",
        tts_voice or "-",
        voice_gender or "-",
        interview_gender or "-",
    )
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    audio_bytes = await audio.read()
    logger.info("upload_audio http chunk_bytes=%s", len(audio_bytes) if audio_bytes else 0)
    ctx = _build_audio_context(
        db,
        current_user,
        session,
        ai_provider=ai_provider,
        ai_model=ai_model,
        ai_tts_model=ai_tts_model,
        tts_voice=tts_voice,
        voice_gender=voice_gender,
        interview_gender=interview_gender,
        full_name=full_name,
    )
    result = await process_audio(audio_bytes, context=ctx)
    return result


@router.websocket("/{session_id}/audio/ws")
async def websocket_audio_stream(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(default=""),
    ai_provider: str | None = Query(default=None),
    ai_model: str | None = Query(default=None),
    ai_tts_model: str | None = Query(default=None),
    tts_voice: str | None = Query(default=None),
    voice_gender: str | None = Query(default=None),
    interview_gender: str | None = Query(default=None),
    full_name: str | None = Query(default=None),
):
    await websocket.accept()
    db = SessionLocal()
    try:
        if not token:
            await websocket.send_json({"type": "error", "message": "Missing auth token"})
            await websocket.close(code=1008)
            return

        try:
            current_user = get_user_from_token(token, db)
        except HTTPException:
            await websocket.send_json({"type": "error", "message": "Invalid authentication token"})
            await websocket.close(code=1008)
            return

        try:
            normalized_session_id = _normalize_session_id(session_id)
        except HTTPException:
            await websocket.send_json({"type": "error", "message": "Invalid session id"})
            await websocket.close(code=1008)
            return
        session = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.id == normalized_session_id,
                InterviewSession.user_id == current_user.id,
            )
            .first()
        )
        if not session:
            await websocket.send_json({"type": "error", "message": "Session not found"})
            await websocket.close(code=1008)
            return

        ctx = _build_audio_context(
            db,
            current_user,
            session,
            ai_provider=ai_provider,
            ai_model=ai_model,
            ai_tts_model=ai_tts_model,
            tts_voice=tts_voice,
            voice_gender=voice_gender,
            interview_gender=interview_gender,
            full_name=full_name,
        )
        logger.info(
            "Audio websocket connected for session %s provider=%s model=%s tts_model=%s tts_voice=%s voice_gender=%s interview_gender=%s",
            session.id,
            ai_provider or "-",
            ai_model or "-",
            ai_tts_model or "-",
            tts_voice or "-",
            voice_gender or "-",
            interview_gender or "-",
        )
        await websocket.send_json({"type": "ready", "session_id": str(session.id)})

        while True:
            message = await websocket.receive()
            audio_bytes = message.get("bytes")
            if audio_bytes:
                logger.info("audio_ws chunk_bytes=%s session=%s", len(audio_bytes), session.id)
                result = await process_audio(audio_bytes, context=ctx)
                await websocket.send_json({"type": "audio_result", "payload": result})
                continue

            text_data = message.get("text")
            if not text_data:
                continue

            try:
                payload = json.loads(text_data)
            except json.JSONDecodeError:
                continue

            event_type = payload.get("type")
            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif event_type == "update_context":
                if payload.get("ai_provider"):
                    ctx["ai_provider"] = payload["ai_provider"]
                if payload.get("ai_model"):
                    ctx["ai_model"] = payload["ai_model"]
                if payload.get("ai_tts_model"):
                    ctx["ai_tts_model"] = payload["ai_tts_model"]
                if payload.get("tts_voice"):
                    ctx["ttsVoice"] = payload["tts_voice"]
                if payload.get("voice_gender"):
                    ctx["voiceGender"] = payload["voice_gender"]
                if payload.get("interview_gender"):
                    ctx["interviewGender"] = payload["interview_gender"]
                if payload.get("full_name"):
                    ctx["full_name"] = payload["full_name"]
    except WebSocketDisconnect:
        logger.info("Audio websocket disconnected for session %s", session_id)
        return
    except Exception:
        logger.exception("Audio websocket stream failed")
        try:
            await websocket.send_json({"type": "error", "message": "Audio websocket failed"})
            await websocket.close(code=1011)
        except Exception:  # noqa: BLE001
            pass
    finally:
        db.close()


@router.post("/{session_id}/welcome", response_model=AudioResponse)
async def welcome_audio(
    session_id: str,
    ai_provider: str | None = Form(default=None),
    ai_model: str | None = Form(default=None),
    ai_tts_model: str | None = Form(default=None),
    tts_voice: str | None = Form(default=None),
    voice_gender: str | None = Form(default=None),
    interview_gender: str | None = Form(default=None),
    full_name: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session_id = _normalize_session_id(session_id)
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    ctx = {"session_id": str(session.id)}
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if profile:
        if profile.preferences:
            ctx.update(profile.preferences)
        if profile.full_name:
            ctx["full_name"] = profile.full_name
    if ai_provider:
        ctx["ai_provider"] = ai_provider
    if ai_model:
        ctx["ai_model"] = ai_model
    if ai_tts_model:
        ctx["ai_tts_model"] = ai_tts_model
    if tts_voice:
        ctx["ttsVoice"] = tts_voice
    if voice_gender:
        ctx["voiceGender"] = voice_gender
    if interview_gender:
        ctx["interviewGender"] = interview_gender
    if full_name:
        ctx["full_name"] = full_name
    return await process_welcome(context=ctx)
