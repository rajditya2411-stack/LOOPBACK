"""Pydantic schemas for Goal."""

from datetime import datetime

from pydantic import BaseModel, Field


class GoalCreate(BaseModel):
    """Schema for creating a new goal."""

    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str = Field(
        default="daily", pattern="^(daily|weekly|monthly|long_term)$"
    )
    status: str = Field(default="active", pattern="^(active|completed|paused|abandoned)$")
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    target_value: int | None = None
    current_value: int | None = None
    unit: str | None = None
    start_date: datetime | None = None
    target_date: datetime | None = None


class GoalRead(BaseModel):
    """Schema for returning goal data."""

    id: str
    user_id: str
    title: str
    description: str | None = None
    category: str
    status: str
    progress: float
    target_value: int | None = None
    current_value: int | None = None
    unit: str | None = None
    start_date: datetime | None = None
    target_date: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GoalUpdate(BaseModel):
    """Schema for updating a goal."""

    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(
        None, pattern="^(daily|weekly|monthly|long_term)$"
    )
    status: str | None = Field(
        None, pattern="^(active|completed|paused|abandoned)$"
    )
    progress: float | None = Field(None, ge=0.0, le=1.0)
    target_value: int | None = None
    current_value: int | None = None
    unit: str | None = None
    target_date: datetime | None = None
