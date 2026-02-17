import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class CodeRun(Base):
    __tablename__ = "code_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("interview_sessions.id"), nullable=False)
    language = Column(String(50), nullable=False)
    source_code = Column(Text, nullable=False)
    stdout = Column(Text, nullable=True)
    stderr = Column(Text, nullable=True)
    exit_code = Column(Integer, nullable=True)
    executed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session = relationship("InterviewSession", back_populates="code_runs")
