"""User settings API endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.config import settings as app_settings
from app.database.session import get_db
from app.models.settings import UserSettings
from app.models.user import User
from app.schemas.settings import UserSettingsRead, UserSettingsUpdate
from app.services.memory_service import reindex_user_memories
from app.services.ai_provider import ProviderConfig, ProviderManager, AIProviderError

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/ai-provider")
async def get_ai_provider_status(
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Expose the effective server-managed provider without exposing credentials."""
    user = await _get_or_create_settings(db, _current_user.id)
    return {"provider": user.ai_provider if user.ai_api_key else app_settings.ai_provider, "model": user.ai_model if user.ai_api_key else app_settings.ai_model, "configured": user.ai_configured or app_settings.ai_provider_configured}


async def _get_or_create_settings(db: AsyncSession, user_id: str) -> UserSettings:
    """Return the user's settings row, creating defaults if missing."""
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("", response_model=UserSettingsRead)
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettings:
    """Return the current user's settings."""
    value = await _get_or_create_settings(db, current_user.id)
    value.ai_api_key = None if not value.ai_api_key else "configured"
    return value


@router.put("", response_model=UserSettingsRead)
async def update_settings(
    data: UserSettingsUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettings:
    """Partially update the current user's settings."""
    # Validate ai_temperature if provided
    if data.ai_temperature is not None:
        try:
            temp_value = float(data.ai_temperature)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ai_temperature must be a numeric string (e.g. '0.7')",
            )
        if not (0.0 <= temp_value <= 2.0):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ai_temperature must be between 0.0 and 2.0",
            )

    settings = await _get_or_create_settings(db, current_user.id)

    update_data = data.model_dump(exclude_unset=True)
    memory_was_disabled = settings.ai_memory_enabled is False
    for field, value in update_data.items():
        setattr(settings, field, value)

    await db.commit()
    await db.refresh(settings)
    if memory_was_disabled and settings.ai_memory_enabled:
        # Approved memories that were created while AI memory was disabled can
        # be indexed only after the user explicitly opts back in.
        background_tasks.add_task(reindex_user_memories, current_user.id)
    return settings


@router.post("/ai/test")
async def test_ai_connection(
    data: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Validate a provider with a bounded, non-streaming probe; never leaks the key."""
    current = await _get_or_create_settings(db, current_user.id)
    provider = data.ai_provider or current.ai_provider
    key = data.ai_api_key if data.ai_api_key and data.ai_api_key != "configured" else current.ai_api_key
    model = data.ai_model or current.ai_model
    if not key or len(key.strip()) < 8:
        return {"connected": False, "message": "Enter an API key before testing the connection."}
    try:
        manager = ProviderManager(ProviderConfig(provider=provider, api_key=key, model=model, temperature=float(data.ai_temperature or current.ai_temperature)))
        await manager.complete_text([{"role": "user", "content": "Reply with OK."}])
        return {"connected": True, "provider": provider, "model": model, "message": "Connected"}
    except (AIProviderError, ValueError) as exc:
        return {"connected": False, "provider": provider, "model": model, "message": str(exc)[:300]}
