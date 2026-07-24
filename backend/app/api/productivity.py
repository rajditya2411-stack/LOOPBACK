"""Proactive planning and AI productivity action endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.productivity import (
    ProductivityActionRequest,
    ProductivityActionResult,
    TodayWorkspace,
)
from app.services.productivity_service import build_today_workspace, run_productivity_action

router = APIRouter(prefix="/productivity", tags=["Productivity"])


@router.get("/today", response_model=TodayWorkspace)
async def get_today_workspace(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TodayWorkspace:
    """Return a prioritized, user-scoped plan for the current day."""
    return await build_today_workspace(db, current_user.id)


@router.post("/actions", response_model=ProductivityActionResult)
async def run_action(
    data: ProductivityActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductivityActionResult:
    """Run a workspace quick action without mutating tasks automatically."""
    return await run_productivity_action(db, current_user.id, data.action)
