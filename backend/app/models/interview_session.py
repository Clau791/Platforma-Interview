import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String(30), default="pending", nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    config = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="sessions")
    messages = relationship("InterviewMessage", back_populates="session")
    emotions = relationship("EmotionSnapshot", back_populates="session")
    code_runs = relationship("CodeRun", back_populates="session")
    report = relationship("InterviewReport", back_populates="session", uselist=False)
