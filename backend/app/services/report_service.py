import json
import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.interview_message import InterviewMessage
from app.models.interview_session import InterviewSession
from app.models.emotion_snapshot import EmotionSnapshot
from app.models.code_run import CodeRun
from app.models.interview_report import InterviewReport
from app.services.ai_client import _gemini_generate_content, _is_gemini_native_model
from app.core.config import settings
from app.utils.errors import AppError


logger = logging.getLogger(__name__)


def _is_realtime_model(model_name: str | None) -> bool:
    lowered = (model_name or "").lower()
    return _is_gemini_native_model(model_name) or "live" in lowered or "bidi" in lowered


def _resolve_report_model() -> str:
    if settings.gemini_text_model and not _is_realtime_model(settings.gemini_text_model):
        return settings.gemini_text_model
    if settings.gemini_model and not _is_realtime_model(settings.gemini_model):
        return settings.gemini_model
    return "gemini-2.5-flash"

REPORT_PROMPT_TEMPLATE = """Ești un evaluator senior de interviuri. Analizează datele de mai jos și generează un raport structurat.

**Mod interviu:** {mode}
**Durata:** {duration_minutes} minute

**Conversație (mesaje):**
{messages_text}

**Emoții detectate (timeline):**
{emotions_text}

{code_section}

Generează un raport JSON valid (fără markdown, fără backticks) cu structura exactă:
{{
  "mode": "{mode}",
  "summary": "<rezumat general în română, 2-3 propoziții>",
  "duration_minutes": {duration_minutes},
  "scores": {{
    {scores_template}
    "overall": <int 1-10>
  }},
  "emotional_timeline": [
    {{"minute": <int>, "emotion": "<str>", "confidence": <float>}}
  ],
  "feedback": [
    {{"area": "<categorie>", "observation": "<ce s-a observat>", "suggestion": "<sfat concret>"}}
  ],
  {code_reviews_template}
  "strengths": ["<punct forte 1>", "<punct forte 2>"],
  "improvements": ["<aspect de îmbunătățit 1>", "<aspect 2>"]
}}"""


async def generate_report(session_id: UUID, db: Session, context: dict | None = None) -> dict:
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise AppError("Session not found", code="session_not_found")

    mode = session.mode or "normal"

    # Load messages
    messages = (
        db.query(InterviewMessage)
        .filter(InterviewMessage.session_id == session_id)
        .order_by(InterviewMessage.created_at.asc())
        .all()
    )
    if not messages:
        messages_text = "(Nu s-au înregistrat mesaje)"
    else:
        lines = []
        for m in messages:
            role_label = "Candidat" if m.role == "user" else "Intervievator"
            lines.append(f"[{role_label}]: {m.content}")
        messages_text = "\n".join(lines)

    # Load emotions
    emotions = (
        db.query(EmotionSnapshot)
        .filter(EmotionSnapshot.session_id == session_id)
        .order_by(EmotionSnapshot.captured_at.asc())
        .all()
    )
    if not emotions:
        emotions_text = "(Nu s-au detectat emoții)"
    else:
        emotion_lines = []
        for e in emotions:
            ts = e.captured_at.strftime("%H:%M:%S") if e.captured_at else "?"
            emotion_lines.append(f"[{ts}] {e.emotion} ({e.confidence:.0%})")
        emotions_text = "\n".join(emotion_lines)

    # Load code runs (for technical mode)
    code_section = ""
    code_reviews_template = ""
    if mode == "technical":
        code_runs = (
            db.query(CodeRun)
            .filter(CodeRun.session_id == session_id)
            .order_by(CodeRun.executed_at.asc())
            .all()
        )
        if code_runs:
            code_lines = []
            for cr in code_runs:
                code_lines.append(
                    f"[{cr.language}] Exit={cr.exit_code}\n```\n{cr.source_code}\n```\nOutput: {cr.stdout or '(gol)'}"
                )
            code_section = "**Code runs:**\n" + "\n---\n".join(code_lines)
        code_reviews_template = '"code_reviews": [{"problem": "<descriere>", "score": <int>, "feedback": "<str>"}],'
    else:
        code_reviews_template = ""

    # Duration
    duration_minutes = 0
    if session.started_at and session.ended_at:
        delta = session.ended_at - session.started_at
        duration_minutes = max(1, int(delta.total_seconds() / 60))

    # Scores template
    if mode == "technical":
        scores_template = '"technical_skill": <int 1-10>,\n    "problem_solving": <int 1-10>,\n    "emotional_stability": <int 1-10>,'
    else:
        scores_template = '"communication": <int 1-10>,\n    "emotional_stability": <int 1-10>,'

    prompt = REPORT_PROMPT_TEMPLATE.format(
        mode=mode,
        duration_minutes=duration_minutes,
        messages_text=messages_text[:6000],
        emotions_text=emotions_text[:2000],
        code_section=code_section[:3000],
        scores_template=scores_template,
        code_reviews_template=code_reviews_template,
    )

    model = _resolve_report_model()
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    data = await _gemini_generate_content(model, payload, context=context, timeout_seconds=45)

    candidates = data.get("candidates") or []
    if not candidates:
        raise AppError("Gemini returned no candidates for report", code="gemini_no_result")

    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text_chunks = [str(part.get("text", "")).strip() for part in parts if part.get("text")]
    raw_text = "\n".join(text_chunks).strip()

    try:
        report_json = json.loads(raw_text)
    except json.JSONDecodeError:
        report_json = {"summary": raw_text, "mode": mode}

    # Save to DB
    existing = db.query(InterviewReport).filter(InterviewReport.session_id == session_id).first()
    if existing:
        existing.report_json = report_json
        db.add(existing)
    else:
        report = InterviewReport(session_id=session_id, report_json=report_json)
        db.add(report)
    db.commit()

    return report_json
