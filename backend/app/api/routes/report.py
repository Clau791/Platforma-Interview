from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.interview_report import InterviewReport
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.schemas.report import ReportResponse
from app.services.report_service import generate_report
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


@router.post("/{session_id}/report/generate", response_model=ReportResponse)
async def generate_session_report(
    session_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = _get_user_session(session_id, current_user, db)

    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    context = {}
    if profile and profile.preferences:
        context.update(profile.preferences)

    report_json = await generate_report(session.id, db, context=context)
    return {"report_json": report_json}


@router.get("/{session_id}/report", response_model=ReportResponse)
def get_report(
    session_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = _get_user_session(session_id, current_user, db)

    report = (
        db.query(InterviewReport)
        .filter(InterviewReport.session_id == session.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return {"report_json": report.report_json}
