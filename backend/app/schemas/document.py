"""Pydantic schemas for Document and DocumentChunk."""

from datetime import datetime

from pydantic import BaseModel, Field


class DocumentRead(BaseModel):
    """Schema for returning document data."""

    id: str
    user_id: str
    title: str
    file_type: str
    file_size: int
    status: str
    summary: str | None = None
    page_count: int | None = None
    word_count: int | None = None
    processing_error: str | None = None
    workspace_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentDetailRead(DocumentRead):
    """Document metadata with a small, safe preview of extracted chunks."""

    preview_chunks: list["DocumentChunkRead"] = []


class DocumentUpdate(BaseModel):
    """Schema for updating a document."""

    title: str | None = Field(None, max_length=255)
    workspace_id: str | None = None


class DocumentChunkRead(BaseModel):
    """Schema for returning document chunk data."""

    id: str
    document_id: str
    content: str
    chunk_index: int
    page_number: int | None = None
    token_count: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentSearchResult(BaseModel):
    """Schema for semantic search results."""

    document_id: str
    document_title: str
    chunk_content: str
    chunk_index: int
    relevance_score: float
    page_number: int | None = None
