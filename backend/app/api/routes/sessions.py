from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.interview_session import InterviewSession
from app.models.interview_message import InterviewMessage
from app.models.emotion_snapshot import EmotionSnapshot
from app.models.code_run import CodeRun
from app.schemas.session import SessionCreate, SessionOut
from app.utils.jwt import get_current_user


router = APIRouter()


def serialize_session(session: InterviewSession) -> dict:
    """Ensure UUID and datetime fields are serialized cleanly for the response model."""
    return SessionOut.model_validate(session).model_dump(mode="json")


@router.post("", response_model=SessionOut)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if payload.mode not in ("normal", "technical"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mode must be 'normal' or 'technical'")
    session = InterviewSession(user_id=current_user.id, mode=payload.mode, config=payload.config, status="pending")
    db.add(session)
    db.commit()
    db.refresh(session)
    return serialize_session(session)


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: str,
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
    return serialize_session(session)


@router.post("/{session_id}/start", response_model=SessionOut)
def start_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        session_id = str(UUID(session_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid session id") from exc

    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    session.status = "in_progress"
    session.started_at = datetime.now(timezone.utc)
    db.add(session)
    db.commit()
    db.refresh(session)
    return serialize_session(session)


@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: str,
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

    session.status = "completed"
    session.ended_at = datetime.now(timezone.utc)
    db.add(session)
    db.commit()
    db.refresh(session)
    return serialize_session(session)


@router.get("", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    activity_exists = or_(
        exists(select(1).select_from(InterviewMessage).where(InterviewMessage.session_id == InterviewSession.id)),
        exists(select(1).select_from(EmotionSnapshot).where(EmotionSnapshot.session_id == InterviewSession.id)),
        exists(select(1).select_from(CodeRun).where(CodeRun.session_id == InterviewSession.id)),
    )
    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.user_id == current_user.id)
        .filter(activity_exists)
        .order_by(InterviewSession.created_at.desc())
        .limit(20)
        .all()
    )
    return [serialize_session(item) for item in sessions]
