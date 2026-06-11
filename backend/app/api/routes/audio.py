from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, WebSocket, status
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, get_db
from app.services.audio_service import build_audio_context, get_user_session, process_audio_turn
from app.utils.errors import AppError
from app.utils.jwt import get_current_user, get_user_from_token


router = APIRouter()


def _http_error_from_app_error(exc: AppError) -> HTTPException:
    if exc.code in {"invalid_session_id"}:
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    elif exc.code in {"session_not_found"}:
        status_code = status.HTTP_404_NOT_FOUND
    elif exc.code.startswith(("gemini_", "stt_")):
        status_code = status.HTTP_502_BAD_GATEWAY
    else:
        status_code = status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=status_code, detail=exc.message)


def _audio_overrides(
    *,
    ai_provider: str | None = None,
    ai_model: str | None = None,
    ai_tts_model: str | None = None,
    tts_voice: str | None = None,
    voice_gender: str | None = None,
    interview_gender: str | None = None,
    full_name: str | None = None,
) -> dict:
    return {
        "aiProvider": ai_provider,
        "aiModel": ai_model,
        "aiTtsModel": ai_tts_model,
        "ttsVoice": tts_voice,
        "voiceGender": voice_gender,
        "interviewGender": interview_gender,
        "fullName": full_name,
    }


@router.post("/{session_id}/audio")
async def process_audio(
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
    try:
        session = get_user_session(db, session_id, current_user)
        context = build_audio_context(
            db,
            session,
            current_user,
            overrides=_audio_overrides(
                ai_provider=ai_provider,
                ai_model=ai_model,
                ai_tts_model=ai_tts_model,
                tts_voice=tts_voice,
                voice_gender=voice_gender,
                interview_gender=interview_gender,
                full_name=full_name,
            ),
        )
        audio_bytes = await audio.read()
        return await process_audio_turn(
            db=db,
            session=session,
            current_user=current_user,
            audio_bytes=audio_bytes,
            mime_type=audio.content_type or "audio/webm",
            context=context,
        )
    except AppError as exc:
        raise _http_error_from_app_error(exc) from exc


@router.websocket("/{session_id}/audio/ws")
async def process_audio_ws(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(...),
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
        current_user = get_user_from_token(token, db)
        session = get_user_session(db, session_id, current_user)
        context = build_audio_context(
            db,
            session,
            current_user,
            overrides=_audio_overrides(
                ai_provider=ai_provider,
                ai_model=ai_model,
                ai_tts_model=ai_tts_model,
                tts_voice=tts_voice,
                voice_gender=voice_gender,
                interview_gender=interview_gender,
                full_name=full_name,
            ),
        )
        await websocket.send_json({"type": "ready", "session_id": str(session.id)})
        while True:
            message = await websocket.receive()
            audio_bytes = message.get("bytes")
            if audio_bytes is None:
                if message.get("type") == "websocket.disconnect":
                    break
                continue
            try:
                result = await process_audio_turn(
                    db=db,
                    session=session,
                    current_user=current_user,
                    audio_bytes=audio_bytes,
                    mime_type="audio/webm",
                    context=context,
                )
                await websocket.send_json({"type": "audio_result", "payload": result})
            except AppError as exc:
                await websocket.send_json({"type": "error", "code": exc.code, "message": exc.message})
    except Exception as exc:  # noqa: BLE001
        detail = exc.message if isinstance(exc, AppError) else "Audio socket authentication failed"
        await websocket.send_json({"type": "error", "message": detail})
        await websocket.close(code=1008)
    finally:
        db.close()
