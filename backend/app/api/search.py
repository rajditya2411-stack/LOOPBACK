"""Unified, user-scoped workspace search with comparable cross-resource ranking."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.chat import Chat, Message
from app.models.document import Document
from app.models.goal import Goal
from app.models.memory import Memory
from app.models.task import Task
from app.models.user import User
from app.services.document_service import search_user_documents
from app.services.memory_service import search_user_memories
from app.services.search_ranking_service import (
    CANDIDATE_MULTIPLIER,
    goal_importance,
    keyword_relevance,
    query_terms,
    relevance_score,
    task_importance,
    text_signals,
    with_metadata,
)

router = APIRouter(prefix="/search", tags=["Search"])

SearchType = Literal["task", "goal", "document", "memory", "chat"]


class SearchResult(BaseModel):
    id: str
    type: SearchType
    title: str
    subtitle: str | None = None
    url: str
    score: float


def _keyword_score(text: str, terms: list[str]) -> float:
    """Backward-compatible keyword scorer used by existing callers and tests."""
    return keyword_relevance(text, terms)


def _result(
    *,
    id: str,
    type: SearchType,
    title: str,
    subtitle: str,
    url: str,
    content: str = "",
    semantic: float = 0.0,
    updated_at: object = None,
    importance: float = 0.0,
    confidence: float = 0.0,
    pinned: bool = False,
    usage_count: int = 0,
    query: str,
) -> SearchResult:
    # SQLAlchemy model timestamps are datetimes at runtime; the loose annotation
    # avoids coupling this transport helper to every ORM type.
    signals = with_metadata(
        text_signals(query, title, content, semantic=semantic),
        updated_at=updated_at,  # type: ignore[arg-type]
        importance=importance,
        confidence=confidence,
        pinned=pinned,
        usage_count=usage_count,
    )
    return SearchResult(id=id, type=type, title=title, subtitle=subtitle, url=url, score=relevance_score(signals))


@router.get("", response_model=list[SearchResult])
async def global_search(
    q: str = Query(..., min_length=1, max_length=300),
    types: list[SearchType] | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SearchResult]:
    """Search user-owned tasks, goals, documents, memories, and chats."""
    query = q.strip()
    terms = query_terms(query)
    if not terms:
        return []
    enabled = set(types or ["task", "goal", "document", "memory", "chat"])
    results: list[SearchResult] = []
    task_filter = or_(*(Task.title.ilike(f"%{term}%") | Task.description.ilike(f"%{term}%") for term in terms))
    goal_filter = or_(*(Goal.title.ilike(f"%{term}%") | Goal.description.ilike(f"%{term}%") for term in terms))

    if "task" in enabled:
        tasks = list((await db.scalars(select(Task).where(Task.user_id == current_user.id, task_filter).limit(limit * CANDIDATE_MULTIPLIER))).all())
        results.extend(_result(
            id=task.id, type="task", title=task.title,
            subtitle=f"{task.status.replace('_', ' ')} · {task.priority} priority", url="/tasks",
            content=task.description or "", updated_at=task.updated_at,
            importance=task_importance(task.priority), query=query,
        ) for task in tasks)

    if "goal" in enabled:
        goals = list((await db.scalars(select(Goal).where(Goal.user_id == current_user.id, goal_filter).limit(limit * CANDIDATE_MULTIPLIER))).all())
        results.extend(_result(
            id=goal.id, type="goal", title=goal.title,
            subtitle=f"{round(goal.progress * 100)}% complete · {goal.status}", url="/goals",
            content=goal.description or "", updated_at=goal.updated_at,
            importance=goal_importance(goal.status, bool(goal.target_date)),
            query=query,
        ) for goal in goals)

    if "document" in enabled:
        documents = list((await db.scalars(select(Document).where(
            Document.user_id == current_user.id,
            or_(*(Document.title.ilike(f"%{term}%") | Document.summary.ilike(f"%{term}%") for term in terms)),
        ).limit(limit * CANDIDATE_MULTIPLIER))).all())
        semantic_matches = await search_user_documents(db, current_user.id, query, limit=limit)
        semantic_ids = [match.document_id for match in semantic_matches]
        semantic_documents = list((await db.scalars(
            select(Document).where(Document.user_id == current_user.id, Document.id.in_(semantic_ids))
        )).all()) if semantic_ids else []
        documents_by_id = {document.id: document for document in [*documents, *semantic_documents]}
        semantic_by_id: dict[str, float] = {}
        for match in semantic_matches:
            semantic_by_id[match.document_id] = max(semantic_by_id.get(match.document_id, 0.0), max(0.0, match.relevance_score))
        results.extend(_result(
            id=document.id, type="document", title=document.title,
            subtitle=("Semantic match" if document.id in semantic_by_id else "Keyword match") + f" · {document.file_type.upper()}",
            url=f"/documents/{document.id}", content=document.summary or "", semantic=semantic_by_id.get(document.id, 0.0),
            updated_at=document.updated_at, query=query,
        ) for document in documents_by_id.values())

    if "memory" in enabled:
        memories = list((await db.scalars(select(Memory).where(
            Memory.user_id == current_user.id,
            Memory.review_status == "approved",
            or_(*(Memory.content.ilike(f"%{term}%") for term in terms)),
        ).limit(limit * CANDIDATE_MULTIPLIER))).all())
        semantic_matches = await search_user_memories(db, current_user.id, query, limit=limit)
        semantic_ids = [memory.id for memory in semantic_matches]
        semantic_memories = list((await db.scalars(
            select(Memory).where(Memory.user_id == current_user.id, Memory.review_status == "approved", Memory.id.in_(semantic_ids))
        )).all()) if semantic_ids else []
        memories_by_id = {memory.id: memory for memory in [*memories, *semantic_memories]}
        semantic_by_id = {memory.id: memory.relevance_score for memory in semantic_matches}
        results.extend(_result(
            id=memory.id, type="memory", title=memory.content[:120],
            subtitle=f"{memory.category} · {'semantic' if memory.id in semantic_by_id else 'keyword'} match", url="/memory",
            content=memory.content, semantic=semantic_by_id.get(memory.id, 0.0), updated_at=memory.updated_at,
            confidence=memory.confidence if memory.confidence is not None else 0.5,
            pinned=memory.is_pinned, usage_count=memory.usage_count, query=query,
        ) for memory in memories_by_id.values())

    if "chat" in enabled:
        rows = (await db.execute(select(Chat, Message.content).outerjoin(Message, Message.chat_id == Chat.id).where(
            Chat.user_id == current_user.id,
            or_(*(Chat.title.ilike(f"%{term}%") | Message.content.ilike(f"%{term}%") for term in terms)),
        ).order_by(Chat.updated_at.desc()).limit(limit * CANDIDATE_MULTIPLIER))).all()
        chats: dict[str, SearchResult] = {}
        for chat, content in rows:
            candidate = _result(
                id=chat.id, type="chat", title=chat.title, subtitle=f"Chat · {(content or chat.title)[:120].strip()}",
                url=f"/chat?chat={chat.id}", content=content or "", updated_at=chat.updated_at, query=query,
            )
            current = chats.get(chat.id)
            if current is None or candidate.score > current.score:
                chats[chat.id] = candidate
        results.extend(chats.values())

    deduplicated: dict[tuple[str, str], SearchResult] = {}
    for result in results:
        key = (result.type, result.id)
        if key not in deduplicated or result.score > deduplicated[key].score:
            deduplicated[key] = result
    return sorted(deduplicated.values(), key=lambda item: (-item.score, item.title.lower()))[:limit]
