from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2)
    password: str = Field(min_length=8)
    experience_level: Optional[str] = None
    target_role: Optional[str] = None
    technologies: List[str] = []


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
