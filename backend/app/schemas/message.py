from typing import Any, Dict, Optional
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MessageCreate(BaseModel):
    role: str
    content: str
    metadata: Optional[Dict[str, Any]] = None


class MessageOut(BaseModel):
    id: UUID
    session_id: UUID
    role: str
    content: str
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
