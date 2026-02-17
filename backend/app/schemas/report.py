from typing import Any, Dict

from pydantic import BaseModel


class ReportResponse(BaseModel):
    report_json: Dict[str, Any]
