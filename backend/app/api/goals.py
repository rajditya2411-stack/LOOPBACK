"""Goals API endpoints."""

from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.models.goal import Goal
from app.schemas.goal import GoalCreate, GoalRead, GoalUpdate

router = APIRouter(prefix="/goals", tags=["Goals"])

@router.get("", response_model=list[GoalRead])
async def list_goals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List all goals for the current user."""
    result = await db.execute(
        select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.created_at.desc())
    )
    return result.scalars().all()

@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
async def create_goal(
    data: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Create a new goal."""
    goal = Goal(**data.model_dump(), user_id=current_user.id)
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal

@router.put("/{goal_id}", response_model=GoalRead)
async def update_goal(
    goal_id: str,
    data: GoalUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Update a goal."""
    result = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
        
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(goal, field, value)
    if update_data.get("status") == "completed" and goal.completed_at is None:
        goal.completed_at = datetime.now(timezone.utc)
    elif update_data.get("status") and update_data["status"] != "completed":
        goal.completed_at = None
        
    await db.commit()
    await db.refresh(goal)
    return goal

@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a goal."""
    result = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
        
    await db.delete(goal)
    await db.commit()
