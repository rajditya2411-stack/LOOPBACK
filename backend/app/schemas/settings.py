"""Pydantic schemas for UserSettings."""

from pydantic import BaseModel, Field


class UserSettingsRead(BaseModel):
    """Schema for returning user settings."""

    id: str
    user_id: str
    theme: str
    language: str
    ai_provider: str
    ai_configured: bool = False
    ai_model: str
    ai_temperature: str
    ai_memory_enabled: bool
    email_notifications: bool
    task_reminders: bool
    ai_suggestions: bool
    storage_used_bytes: int

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    """Schema for updating user settings."""

    theme: str | None = Field(None, pattern="^(light|dark|system)$")
    language: str | None = Field(None, max_length=10)
    ai_provider: str | None = Field(None, pattern="^(openai|gemini|xai|anthropic|kimi)$")
    ai_api_key: str | None = Field(None, max_length=500)
    ai_model: str | None = None
    ai_temperature: str | None = None
    ai_streaming: bool | None = None
    ai_memory_enabled: bool | None = None
    email_notifications: bool | None = None
    task_reminders: bool | None = None
    ai_suggestions: bool | None = None

    def model_dump_safe(self, **kwargs: object) -> dict[str, object]:
        return self.model_dump(exclude_unset=True, **kwargs)
