import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    full_name = Column(String(120), nullable=True)
    experience_level = Column(String(50), nullable=True)
    target_role = Column(String(120), nullable=True)
    technologies = Column(JSON, default=list)
    preferences = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="profile")
