from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.emotion_snapshot import EmotionSnapshot
from app.models.interview_session import InterviewSession
from app.schemas.emotion import EmotionResponse
from app.services.emotion_service import analyze_emotion
from app.utils.jwt import get_current_user


router = APIRouter()


@router.post("/{session_id}/emotion", response_model=EmotionResponse)
async def upload_emotion(
    session_id: str,
    frame: UploadFile = File(...),
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

    frame_bytes = await frame.read()
    result = analyze_emotion(frame_bytes)

    snapshot = EmotionSnapshot(
        session_id=session.id,
        emotion=result["emotion"],
        confidence=result["confidence"],
    )
    db.add(snapshot)
    db.commit()
    return result
