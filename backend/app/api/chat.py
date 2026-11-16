"""Chat API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.chat import (
    ChatCreate,
    ChatRead,
    ChatUpdate,
    ChatWithMessages,
    MessageCreate,
)
from app.schemas.common import MessageResponse
from app.services.chat_service import (
    create_chat,
    delete_chat,
    get_chat_with_messages,
    get_user_chats,
    rename_chat,
    stream_chat_response,
)

router = APIRouter(prefix="/chats", tags=["Chat"])


@router.get("", response_model=list[ChatRead])
async def list_chats(
    workspace_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List all chats for the current user, optionally filtered by workspace_id."""
    return await get_user_chats(db, current_user.id, workspace_id=workspace_id)


@router.post("", response_model=ChatRead, status_code=status.HTTP_201_CREATED)
async def start_chat(
    data: ChatCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Create a new chat conversation, optionally assigned to a workspace project."""
    return await create_chat(db, current_user.id, data.title, workspace_id=data.workspace_id)


@router.get("/{chat_id}", response_model=ChatWithMessages)
async def get_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Retrieve a specific chat with its message history."""
    return await get_chat_with_messages(db, current_user.id, chat_id)


@router.put("/{chat_id}", response_model=ChatRead)
async def update_chat(
    chat_id: str,
    data: ChatUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Rename a user-owned chat conversation or update its workspace association."""
    if data.title is None and "workspace_id" not in data.model_fields_set:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A chat title or workspace_id is required")
    chat = await get_chat_with_messages(db, current_user.id, chat_id)
    if data.title is not None:
        chat.title = data.title.strip() or "New Chat"
    if "workspace_id" in data.model_fields_set:
        chat.workspace_id = data.workspace_id
        from app.models.workspace import WorkspaceResource
        from sqlalchemy import delete
        await db.execute(
            delete(WorkspaceResource).where(
                WorkspaceResource.resource_type == "chat",
                WorkspaceResource.resource_id == chat.id,
            )
        )
        if data.workspace_id:
            db.add(WorkspaceResource(
                workspace_id=data.workspace_id,
                resource_type="chat",
                resource_id=chat.id,
            ))
    await db.commit()
    await db.refresh(chat)
    return chat


@router.delete("/{chat_id}", response_model=MessageResponse)
async def remove_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Delete a chat conversation."""
    await delete_chat(db, current_user.id, chat_id)
    return {"message": "Chat deleted"}


@router.post("/{chat_id}/messages/stream")
async def send_message_stream(
    chat_id: str,
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Send a message and stream the AI's response via Server-Sent Events."""
    from app.models.settings import UserSettings
    user_settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == current_user.id))
    from app.core.config import settings
    if not (user_settings and user_settings.ai_api_key) and not settings.ai_provider_configured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Configure an AI provider and API key in AI Configuration Center.")
    generator = await stream_chat_response(db, current_user.id, chat_id, data.content, retry=data.retry)
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
