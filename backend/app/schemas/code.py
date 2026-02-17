from typing import Optional

from pydantic import BaseModel


class CodeRunRequest(BaseModel):
    language: str
    source_code: str


class CodeRunResponse(BaseModel):
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    exit_code: Optional[int] = None
