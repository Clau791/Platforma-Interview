from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    experience_level: Optional[str] = None
    target_role: Optional[str] = None
    technologies: Optional[List[str]] = None
    preferences: Optional[Dict[str, Any]] = None


class ProfileOut(BaseModel):
    id: UUID
    user_id: UUID
    full_name: Optional[str] = None
    experience_level: Optional[str] = None
    target_role: Optional[str] = None
    technologies: List[str] = []
    preferences: Dict[str, Any] = {}

    model_config = ConfigDict(from_attributes=True)
