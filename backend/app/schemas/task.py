"""Pydantic schemas for Task."""

from datetime import datetime

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    """Schema for creating a new task."""

    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: str = Field(default="todo", pattern="^(todo|in_progress|review|done)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    due_date: datetime | None = None
    parent_id: str | None = None
    is_recurring: bool = False
    recurrence_rule: str | None = None


class TaskRead(BaseModel):
    """Schema for returning task data."""

    id: str
    user_id: str
    parent_id: str | None = None
    title: str
    description: str | None = None
    status: str
    priority: str
    due_date: datetime | None = None
    is_recurring: bool
    recurrence_rule: str | None = None
    position: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    subtask_count: int = 0

    model_config = {"from_attributes": True}


class TaskUpdate(BaseModel):
    """Schema for updating a task."""

    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = Field(None, pattern="^(todo|in_progress|review|done)$")
    priority: str | None = Field(None, pattern="^(low|medium|high|urgent)$")
    due_date: datetime | None = None
    position: int | None = None
    is_recurring: bool | None = None
    recurrence_rule: str | None = None


class TaskReorder(BaseModel):
    """Schema for reordering tasks (Kanban drag & drop)."""

    task_id: str
    new_status: str = Field(pattern="^(todo|in_progress|review|done)$")
    new_position: int
