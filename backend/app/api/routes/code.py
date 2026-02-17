from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.code_run import CodeRun
from app.models.interview_session import InterviewSession
from app.schemas.code import CodeRunRequest, CodeRunResponse
from app.services.sandbox_service import execute_code
from app.utils.jwt import get_current_user


router = APIRouter()


@router.post("/{session_id}/code/execute", response_model=CodeRunResponse)
def run_code(
    session_id: str,
    payload: CodeRunRequest,
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

    result = execute_code(payload.language, payload.source_code)
    run = CodeRun(
        session_id=session.id,
        language=payload.language,
        source_code=payload.source_code,
        stdout=result.get("stdout"),
        stderr=result.get("stderr"),
        exit_code=result.get("exit_code"),
    )
    db.add(run)
    db.commit()
    return result
