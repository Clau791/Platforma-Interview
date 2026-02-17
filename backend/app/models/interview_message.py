import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class InterviewMessage(Base):
    __tablename__ = "interview_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("interview_sessions.id"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    metadata_ = Column("metadata", JSON, default=dict)

    session = relationship("InterviewSession", back_populates="messages")
