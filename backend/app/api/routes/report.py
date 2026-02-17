from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.interview_report import InterviewReport
from app.models.interview_session import InterviewSession
from app.schemas.report import ReportResponse
from app.utils.jwt import get_current_user


router = APIRouter()


@router.get("/{session_id}/report", response_model=ReportResponse)
def get_report(
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

    report = (
        db.query(InterviewReport)
        .filter(InterviewReport.session_id == session.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return {"report_json": report.report_json}
