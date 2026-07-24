"""Memory API endpoints."""

from typing import Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.models.memory import Memory
from app.schemas.memory import MemoryCreate, MemoryRead, MemoryUpdate
from app.services.memory_service import index_memory_by_id, remove_memory_from_index

router = APIRouter(prefix="/memory", tags=["Memory"])

@router.get("", response_model=list[MemoryRead])
async def list_memories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List all memories for the current user."""
    result = await db.execute(
        select(Memory).where(Memory.user_id == current_user.id).order_by(Memory.created_at.desc())
    )
    return result.scalars().all()


@router.get("/review", response_model=list[MemoryRead])
async def list_pending_memories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List AI-extracted memories awaiting the user's approval."""
    result = await db.execute(
        select(Memory)
        .where(
            Memory.user_id == current_user.id,
            Memory.source == "auto",
            Memory.review_status == "pending",
        )
        .order_by(Memory.created_at.desc())
    )
    return result.scalars().all()

@router.post("", response_model=MemoryRead, status_code=status.HTTP_201_CREATED)
async def create_memory(
    data: MemoryCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Create a new memory."""
    memory = Memory(**data.model_dump(), user_id=current_user.id, source="manual")
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    background_tasks.add_task(index_memory_by_id, memory.id)
    return memory

@router.put("/{memory_id}", response_model=MemoryRead)
async def update_memory(
    memory_id: str,
    data: MemoryUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Update a memory."""
    result = await db.execute(select(Memory).where(Memory.id == memory_id, Memory.user_id == current_user.id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
        
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(memory, field, value)
    memory.embedding_id = None
    await db.commit()
    await db.refresh(memory)
    background_tasks.add_task(remove_memory_from_index, memory.id)
    background_tasks.add_task(index_memory_by_id, memory.id)
    return memory


@router.post("/{memory_id}/approve", response_model=MemoryRead)
async def approve_memory(
    memory_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Approve an extracted memory so it can participate in retrieval."""
    memory = await db.scalar(
        select(Memory).where(Memory.id == memory_id, Memory.user_id == current_user.id)
    )
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    if memory.source != "auto":
        raise HTTPException(status_code=422, detail="Only AI-generated memories require approval")
    memory.review_status = "approved"
    await db.commit()
    await db.refresh(memory)
    background_tasks.add_task(index_memory_by_id, memory.id)
    return memory


@router.post("/{memory_id}/reject", response_model=MemoryRead)
async def reject_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Reject an extracted memory and ensure it is excluded from retrieval."""
    memory = await db.scalar(
        select(Memory).where(Memory.id == memory_id, Memory.user_id == current_user.id)
    )
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    if memory.source != "auto":
        raise HTTPException(status_code=422, detail="Only AI-generated memories can be rejected")
    memory.review_status = "rejected"
    memory.is_pinned = False
    await db.commit()
    remove_memory_from_index(memory.id)
    return memory

@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a memory."""
    result = await db.execute(select(Memory).where(Memory.id == memory_id, Memory.user_id == current_user.id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
        
    memory_id = memory.id
    await db.delete(memory)
    await db.commit()
    remove_memory_from_index(memory_id)
