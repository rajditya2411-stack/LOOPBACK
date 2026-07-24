"""UserSettings model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class UserSettings(Base):
    """Per-user settings and preferences."""

    __tablename__ = "user_settings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Appearance
    theme: Mapped[str] = mapped_column(String(20), default="light")  # light, dark, system
    language: Mapped[str] = mapped_column(String(10), default="en")

    # AI
    ai_provider: Mapped[str] = mapped_column(String(20), default="openai")
    ai_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_model: Mapped[str] = mapped_column(String(100), default="gpt-4o-mini")
    ai_temperature: Mapped[str] = mapped_column(String(10), default="0.7")
    ai_streaming: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_memory_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Notifications
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    task_reminders: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_suggestions: Mapped[bool] = mapped_column(Boolean, default=True)

    # Storage
    storage_used_bytes: Mapped[int] = mapped_column(default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="settings")  # noqa: F821

    def __repr__(self) -> str:
        return f"<UserSettings user={self.user_id}>"

    @property
    def ai_configured(self) -> bool:
        return bool(self.ai_api_key and self.ai_api_key.strip())
