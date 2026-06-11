from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.code_run import CodeRun
from app.models.interview_message import InterviewMessage
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.schemas.code import CodeRunRequest, CodeRunResponse, CodeReviewRequest, CodeReviewResponse
from app.services.sandbox_service import execute_code
from app.services.code_review_service import review_code
from app.utils.errors import AppError
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


def _build_review_context(session: InterviewSession, current_user, db: Session) -> dict:
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    context = {}
    if profile and profile.preferences:
        context.update(profile.preferences)
    if session.config:
        context.update(session.config)

    messages = (
        db.query(InterviewMessage)
        .filter(InterviewMessage.session_id == session.id)
        .order_by(InterviewMessage.created_at.asc())
        .all()
    )
    context["interviewMode"] = session.mode or "normal"
    context["interviewHistory"] = [
        {"role": message.role, "content": message.content}
        for message in messages[-30:]
        if message.content
    ]
    return context


def _format_review_request_message(payload: CodeReviewRequest) -> str:
    output_lines = [
        "Am trimis soluția pentru review.",
        "",
        f"Limbaj: {payload.language}",
        "",
        f"```{payload.language}",
        payload.source_code.strip(),
        "```",
    ]
    if payload.stdout or payload.stderr or payload.exit_code is not None:
        output_lines.extend(
            [
                "",
                "Output execuție:",
                f"stdout: {payload.stdout or '(gol)'}",
                f"stderr: {payload.stderr or '(gol)'}",
                f"exit code: {payload.exit_code if payload.exit_code is not None else 0}",
            ]
        )
    return "\n".join(output_lines)


def _format_review_response_message(result: dict) -> str:
    suggestions = result.get("suggestions") or []
    suggestion_text = "\n".join(f"- {item}" for item in suggestions)
    parts = [
        "Review soluție:",
        f"Scor: {result.get('score', 5)}/10",
        f"Status: {'corect' if result.get('correct') else 'necesită îmbunătățiri'}",
        "",
        str(result.get("review") or "").strip(),
    ]
    complexity = result.get("complexity")
    if complexity and complexity != "N/A":
        parts.extend(["", f"Complexitate: {complexity}"])
    if suggestion_text:
        parts.extend(["", "Sugestii:", suggestion_text])
    return "\n".join(part for part in parts if part is not None)


@router.post("/{session_id}/code/execute", response_model=CodeRunResponse)
def run_code(
    session_id: str,
    payload: CodeRunRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = _get_user_session(session_id, current_user, db)

    try:
        result = execute_code(payload.language, payload.source_code)
    except AppError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc
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

    context = _build_review_context(session, current_user, db)

    try:
        result = await review_code(
            problem_description=payload.problem_description,
            source_code=payload.source_code,
            language=payload.language,
            stdout=payload.stdout or "",
            stderr=payload.stderr or "",
            exit_code=payload.exit_code or 0,
            context=context,
        )
    except AppError as exc:
        status_code = status.HTTP_502_BAD_GATEWAY if exc.code.startswith("gemini_") else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=exc.message) from exc

    db.add(
        InterviewMessage(
            session_id=session.id,
            role="user",
            content=_format_review_request_message(payload),
            metadata_={"type": "code_review_request", "language": payload.language},
        )
    )
    db.add(
        InterviewMessage(
            session_id=session.id,
            role="assistant",
            content=_format_review_response_message(result),
            metadata_={"type": "code_review_response", "language": payload.language},
        )
    )
    db.commit()
    return result
