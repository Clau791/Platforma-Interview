from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.code_run import CodeRun
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.schemas.code import CodeRunRequest, CodeRunResponse, CodeReviewRequest, CodeReviewResponse
from app.services.sandbox_service import execute_code
from app.services.code_review_service import review_code
from app.utils.jwt import get_current_user


router = APIRouter()


def _get_user_session(session_id, current_user, db):
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.post("/{session_id}/code/execute", response_model=CodeRunResponse)
def run_code(
    session_id: str,
    payload: CodeRunRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = _get_user_session(session_id, current_user, db)

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


@router.post("/{session_id}/code/review", response_model=CodeReviewResponse)
async def code_review(
    session_id: str,
    payload: CodeReviewRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = _get_user_session(session_id, current_user, db)

    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    context = {}
    if profile and profile.preferences:
        context.update(profile.preferences)

    result = await review_code(
        problem_description=payload.problem_description,
        source_code=payload.source_code,
        language=payload.language,
        stdout=payload.stdout or "",
        stderr=payload.stderr or "",
        exit_code=payload.exit_code or 0,
        context=context,
    )
    return result
