from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class CodeRunRequest(BaseModel):
    language: str
    source_code: str


class CodeRunResponse(BaseModel):
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    exit_code: Optional[int] = None


class CodeReviewRequest(BaseModel):
    problem_description: str = ""
    source_code: str
    language: str = "python"
    stdout: Optional[str] = ""
    stderr: Optional[str] = ""
    exit_code: Optional[int] = 0


class CodeReviewResponse(BaseModel):
    score: int = 5
    correct: bool = False
    review: str = ""
    complexity: str = "N/A"
    suggestions: List[str] = []
