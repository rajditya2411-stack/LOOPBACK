"""Tasks API endpoints."""

from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskRead, TaskReorder, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["Tasks"])

@router.get("", response_model=list[TaskRead])
async def list_tasks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List all tasks for the current user."""
    result = await db.execute(
        select(Task).where(Task.user_id == current_user.id).order_by(Task.position, Task.created_at.desc())
    )
    return result.scalars().all()

@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Create a new task."""
    highest_position = await db.scalar(
        select(Task.position)
        .where(Task.user_id == current_user.id, Task.status == data.status)
        .order_by(Task.position.desc())
        .limit(1)
    )
    task = Task(**data.model_dump(), user_id=current_user.id, position=(highest_position or -1) + 1)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.post("/reorder", response_model=TaskRead)
async def reorder_task(
    data: TaskReorder,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Task:
    """Move a task to a Kanban column and atomically normalize its ordering."""
    task = await db.scalar(
        select(Task).where(Task.id == data.task_id, Task.user_id == current_user.id)
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    was_done = task.status == "done"
    task.status = data.new_status
    if data.new_status == "done" and not was_done:
        task.completed_at = datetime.now(timezone.utc)
    elif data.new_status != "done" and was_done:
        task.completed_at = None
    column_tasks = list(
        (await db.scalars(
            select(Task)
            .where(Task.user_id == current_user.id, Task.status == data.new_status, Task.id != task.id)
            .order_by(Task.position, Task.created_at)
        )).all()
    )
    insert_at = min(max(data.new_position, 0), len(column_tasks))
    column_tasks.insert(insert_at, task)
    for position, column_task in enumerate(column_tasks):
        column_task.position = position

    await db.commit()
    await db.refresh(task)
    return task

@router.put("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: str,
    data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Update a task."""
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == current_user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    if "status" in update_data:
        if update_data["status"] == "done" and task.completed_at is None:
            task.completed_at = datetime.now(timezone.utc)
        elif update_data["status"] != "done":
            task.completed_at = None
        
    await db.commit()
    await db.refresh(task)
    return task

@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a task."""
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == current_user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    await db.delete(task)
    await db.commit()
