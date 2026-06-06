from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.interview_session import InterviewSession
from app.models.interview_message import InterviewMessage
from app.schemas.message import MessageCreate, MessageOut
from app.utils.jwt import get_current_user


router = APIRouter()


def _get_user_session(session_id: str, current_user, db: Session) -> InterviewSession:
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
    return session


@router.post("/{session_id}/messages", response_model=MessageOut)
def create_message(
    session_id: str,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = _get_user_session(session_id, current_user, db)

    if payload.role not in ("user", "assistant"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be 'user' or 'assistant'")
    if not payload.content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Content cannot be empty")

    message = InterviewMessage(
        session_id=session.id,
        role=payload.role,
        content=payload.content.strip(),
        metadata_=payload.metadata or {},
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return MessageOut(
        id=message.id,
        session_id=message.session_id,
        role=message.role,
        content=message.content,
        metadata=message.metadata_,
        created_at=message.created_at,
    )


@router.get("/{session_id}/messages", response_model=list[MessageOut])
def list_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = _get_user_session(session_id, current_user, db)

    messages = (
        db.query(InterviewMessage)
        .filter(InterviewMessage.session_id == session.id)
        .order_by(InterviewMessage.created_at.asc())
        .all()
    )
    return [
        MessageOut(
            id=m.id,
            session_id=m.session_id,
            role=m.role,
            content=m.content,
            metadata=m.metadata_,
            created_at=m.created_at,
        )
        for m in messages
    ]
