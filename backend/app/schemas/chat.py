"""Pydantic schemas for Chat and Message."""

from datetime import datetime

from pydantic import BaseModel, Field


class DocumentCitation(BaseModel):
    """A document excerpt supplied as context for an assistant response."""

    document_id: str
    document_title: str
    chunk_index: int
    page_number: int | None = None
    relevance_score: float
    snippet: str | None = None


class ChatCreate(BaseModel):
    """Schema for creating a new chat."""

    title: str = Field(default="New Chat", max_length=255)
    workspace_id: str | None = None


class ChatRead(BaseModel):
    """Schema for returning chat data."""

    id: str
    user_id: str
    title: str
    workspace_id: str | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message: str | None = None

    model_config = {"from_attributes": True}


class ChatUpdate(BaseModel):
    """Schema for updating a chat."""

    title: str | None = Field(None, max_length=255)
    workspace_id: str | None = None


class MessageCreate(BaseModel):
    """Schema for creating a new message."""

    content: str = Field(min_length=1)
    role: str = Field(default="user", pattern="^(user|assistant|system)$")
    retry: bool = False


class MessageRead(BaseModel):
    """Schema for returning message data."""

    id: str
    chat_id: str
    role: str
    content: str
    token_count: int | None = None
    citations: list[DocumentCitation] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatWithMessages(BaseModel):
    """Chat with its full message history."""

    id: str
    user_id: str
    title: str
    workspace_id: str | None = None
    created_at: datetime
    updated_at: datetime
    messages: list[MessageRead] = []

    model_config = {"from_attributes": True}
