"""Pydantic schemas for Notification."""

from datetime import datetime

from pydantic import BaseModel, Field


class NotificationRead(BaseModel):
    """Schema for returning notification data."""

    id: str
    user_id: str
    title: str
    message: str
    type: str
    is_read: bool
    action_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationUpdate(BaseModel):
    """Schema for marking a notification as read."""

    is_read: bool = True
