"""Analytics API endpoints."""

from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.models.task import Task
from app.models.goal import Goal
from app.models.memory import Memory
from app.models.document import Document
from app.schemas.productivity import WeeklyAnalytics
from app.services.productivity_service import build_weekly_analytics

router = APIRouter(prefix="/analytics", tags=["Analytics"])

class DashboardAnalytics(BaseModel):
    tasks_count: int
    goals_count: int
    memories_count: int
    documents_count: int

@router.get("/dashboard", response_model=DashboardAnalytics)
async def get_dashboard_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get dashboard analytics for the current user."""
    
    tasks_result = await db.execute(select(func.count(Task.id)).where(Task.user_id == current_user.id))
    tasks_count = tasks_result.scalar_one()
    
    goals_result = await db.execute(select(func.count(Goal.id)).where(Goal.user_id == current_user.id))
    goals_count = goals_result.scalar_one()
    
    memories_result = await db.execute(select(func.count(Memory.id)).where(Memory.user_id == current_user.id))
    memories_count = memories_result.scalar_one()
    
    documents_result = await db.execute(select(func.count(Document.id)).where(Document.user_id == current_user.id))
    documents_count = documents_result.scalar_one()

    return DashboardAnalytics(
        tasks_count=tasks_count,
        goals_count=goals_count,
        memories_count=memories_count,
        documents_count=documents_count
    )


@router.get("/weekly", response_model=WeeklyAnalytics)
async def get_weekly_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeeklyAnalytics:
    """Return completion trends and actionable workload patterns for the week."""
    return await build_weekly_analytics(db, current_user.id, use_ai=True)
