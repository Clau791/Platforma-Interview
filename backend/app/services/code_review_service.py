import logging
import json

from app.services.ai_client import _context_value, _gemini_generate_content, _is_gemini_native_model
from app.core.config import settings
from app.utils.errors import AppError


logger = logging.getLogger(__name__)
GEMINI_TEXT_FALLBACK_MODEL = "gemini-2.5-flash"


def _is_realtime_model(model_name: str | None) -> bool:
    lowered = (model_name or "").lower()
    return _is_gemini_native_model(model_name) or "live" in lowered or "bidi" in lowered


def _resolve_review_model(context: dict | None = None) -> str:
    candidates = [
        _context_value(context, "aiReviewModel", "ai_review_model", "aiTextModel", "ai_text_model"),
        _context_value(context, "aiModel", "ai_model"),
        settings.gemini_text_model,
        settings.gemini_model,
        GEMINI_TEXT_FALLBACK_MODEL,
    ]
    for candidate in candidates:
        if candidate and not _is_realtime_model(candidate):
            return candidate
    return GEMINI_TEXT_FALLBACK_MODEL


def _format_interview_history(context: dict | None) -> str:
    history = (context or {}).get("interviewHistory") or []
    if not history:
        return "Nu există istoric disponibil."

    lines = []
    for item in history[-30:]:
        role = str(item.get("role", "unknown")).strip() or "unknown"
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        if len(content) > 2000:
            content = f"{content[:2000]}..."
        lines.append(f"{role}: {content}")
    return "\n".join(lines) or "Nu există istoric disponibil."


REVIEW_PROMPT_TEMPLATE = """Ești același intervievator AI din interviul tehnic curent și faci review la soluția candidatului în contextul conversației.
Ține cont de istoricul interviului, cerința discutată, clarificări și output-ul execuției.

**Problema:**
{problem}

**Istoric interviu:**
{interview_history}

**Limbaj:** {language}

**Codul candidatului:**
```{language}
{source_code}
```

**Output execuție:**
stdout: {stdout}
stderr: {stderr}
Exit code: {exit_code}

Răspunde STRICT în format JSON valid (fără markdown, fără backticks) cu structura:
{{
  "score": <int 1-10>,
  "correct": <bool>,
  "review": "<feedback detaliat în română, 3-5 propoziții>",
  "complexity": "<complexitatea timp/spațiu, ex: O(n), O(n log n)>",
  "suggestions": ["<sugestie 1>", "<sugestie 2>"]
}}"""


async def review_code(
    problem_description: str,
    source_code: str,
    language: str,
    stdout: str = "",
    stderr: str = "",
    exit_code: int = 0,
    context: dict | None = None,
) -> dict:
    if not source_code.strip():
        raise AppError("Source code is empty", code="empty_code")

    prompt = REVIEW_PROMPT_TEMPLATE.format(
        problem=problem_description or "Nu a fost specificată o problemă.",
        language=language,
        source_code=source_code,
        interview_history=_format_interview_history(context),
        stdout=stdout or "(gol)",
        stderr=stderr or "(gol)",
        exit_code=exit_code,
    )

    model = _resolve_review_model(context)
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

    data = await _gemini_generate_content(model, payload, context=context, timeout_seconds=30)

    candidates = data.get("candidates") or []
    if not candidates:
        raise AppError("Gemini returned no candidates for code review", code="gemini_no_result")

    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text_chunks = [str(part.get("text", "")).strip() for part in parts if part.get("text")]
    raw_text = "\n".join(text_chunks).strip()

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        result = {
            "score": 5,
            "correct": False,
            "review": raw_text,
            "complexity": "N/A",
            "suggestions": [],
        }

    return result
