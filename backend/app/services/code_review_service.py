import logging

from app.services.ai_client import _gemini_generate_content, _resolve_gemini_api_key
from app.core.config import settings
from app.utils.errors import AppError


logger = logging.getLogger(__name__)

REVIEW_PROMPT_TEMPLATE = """Ești un reviewer de cod senior. Analizează soluția candidatului pentru problema de mai jos.

**Problema:**
{problem}

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
        stdout=stdout or "(gol)",
        stderr=stderr or "(gol)",
        exit_code=exit_code,
    )

    model = settings.gemini_model
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

    import json
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
