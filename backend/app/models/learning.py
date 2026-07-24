"""Persistent active-recall study sessions and evaluated explanations."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base

class LearningSession(Base):
    __tablename__ = "learning_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    topic: Mapped[str] = mapped_column(String(255), default="General understanding")
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality: Mapped[float | None] = mapped_column(Float, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(30), nullable=True)
    missing_concepts: Mapped[str] = mapped_column(Text, default="[]")
    misconceptions: Mapped[str] = mapped_column(Text, default="[]")
    strengths: Mapped[str] = mapped_column(Text, default="[]")
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_questions: Mapped[str] = mapped_column(Text, default="[]")
    revision_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
