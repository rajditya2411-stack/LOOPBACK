"""Pydantic schemas for Memory."""

from datetime import datetime

from pydantic import BaseModel, Field


MEMORY_CATEGORIES = "^(general|preference|decision|fact|goal|project|instruction|important_fact|long_term_goal|project_information)$"


class MemoryCreate(BaseModel):
    """Schema for creating a new memory."""

    content: str = Field(min_length=1)
    category: str = Field(
        default="general",
        pattern=MEMORY_CATEGORIES,
    )
    is_pinned: bool = False
    workspace_id: str | None = None


class MemoryRead(BaseModel):
    """Schema for returning memory data."""

    id: str
    user_id: str
    content: str
    category: str
    source: str
    review_status: str
    is_pinned: bool
    relevance_score: float
    workspace_id: str | None = None
    source_chat_id: str | None = None
    source_message_id: str | None = None
    confidence: float | None = None
    usage_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemoryUpdate(BaseModel):
    """Schema for updating a memory."""

    content: str | None = Field(None, min_length=1)
    category: str | None = Field(
        None, pattern=MEMORY_CATEGORIES
    )
    is_pinned: bool | None = None
    workspace_id: str | None = None
