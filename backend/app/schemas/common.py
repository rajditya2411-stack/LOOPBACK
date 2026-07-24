"""Shared / common schemas."""

from pydantic import BaseModel


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str


class PaginatedResponse(BaseModel):
    """Wrapper for paginated list responses."""

    items: list
    total: int
    page: int
    page_size: int
    total_pages: int
