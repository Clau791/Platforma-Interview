import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class EmotionSnapshot(Base):
    __tablename__ = "emotion_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("interview_sessions.id"), nullable=False)
    captured_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    emotion = Column(String(30), nullable=False)
    confidence = Column(Float, nullable=False)

    session = relationship("InterviewSession", back_populates="emotions")
