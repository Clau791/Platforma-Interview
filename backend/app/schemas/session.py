from typing import Any, Dict, Optional
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SessionCreate(BaseModel):
    mode: str = "normal"
    config: Dict[str, Any] = {}


class SessionOut(BaseModel):
    id: UUID
    user_id: UUID
    status: str
    mode: str = "normal"
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    config: Dict[str, Any] = {}

    model_config = ConfigDict(from_attributes=True)
