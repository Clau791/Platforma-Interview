import time
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.interview_message import InterviewMessage
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.models.user import User
from app.services.ai_client import generate_reply, transcribe_audio
from app.utils.errors import AppError


def get_user_session(db: Session, session_id: str, current_user: User) -> InterviewSession:
    try:
        normalized_session_id = str(UUID(session_id))
    except ValueError as exc:
        raise AppError("Invalid session id", code="invalid_session_id") from exc

    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == normalized_session_id, InterviewSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise AppError("Session not found", code="session_not_found")
    return session


def build_audio_context(
    db: Session,
    session: InterviewSession,
    current_user: User,
    overrides: dict | None = None,
) -> dict:
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    context = {}
    if session.config:
        context["sessionConfig"] = session.config
    context["interviewMode"] = session.mode or "normal"
    if profile:
        context.update(
            {
                "fullName": profile.full_name,
                "experienceLevel": profile.experience_level,
                "targetRole": profile.target_role,
                "technologies": profile.technologies or [],
            }
        )
        if profile.preferences:
            context.update(profile.preferences)
    if overrides:
        context.update({key: value for key, value in overrides.items() if value not in (None, "")})
    return context


def get_recent_conversation(db: Session, session: InterviewSession, limit: int = 8) -> str:
    messages = (
        db.query(InterviewMessage)
        .filter(InterviewMessage.session_id == session.id)
        .order_by(InterviewMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    lines = []
    for message in reversed(messages):
        label = "Candidat" if message.role == "user" else "Intervievator"
        lines.append(f"{label}: {message.content}")
    return "\n".join(lines)


async def process_audio_turn(
    *,
    db: Session,
    session: InterviewSession,
    current_user: User,
    audio_bytes: bytes,
    mime_type: str,
    context: dict | None = None,
) -> dict:
    started_at = time.perf_counter()
    if not audio_bytes:
        raise AppError("Audio payload is empty", code="empty_audio")

    resolved_context = context or build_audio_context(db, session, current_user)
    transcript = await transcribe_audio(audio_bytes, mime_type=mime_type, context=resolved_context)
    conversation = get_recent_conversation(db, session)
    prompt = (
        "Continua interviul in limba romana.\n"
        f"Mod interviu: {session.mode or 'normal'}.\n"
        f"Istoric recent:\n{conversation or '(fara istoric)'}\n\n"
        f"Ultimul raspuns al candidatului:\n{transcript}\n\n"
        "Raspunde ca intervievatorul. Pune o singura intrebare sau ofera feedback scurt, dupa caz."
    )
    assistant_text = await generate_reply(prompt, context=resolved_context)
    latency_ms = int((time.perf_counter() - started_at) * 1000)
    return {
        "transcript": transcript,
        "assistant_text": assistant_text,
        "tts_audio_url": None,
        "latency_ms": latency_ms,
    }
