import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class InterviewReport(Base):
    __tablename__ = "interview_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("interview_sessions.id"), nullable=False, unique=True)
    report_json = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session = relationship("InterviewSession", back_populates="report")
