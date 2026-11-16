"""Automatic memory extraction, vector indexing, and ranked retrieval."""

from __future__ import annotations

import json
import logging
import math
import re
import asyncio
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import async_session_factory
from app.models.memory import Memory
from app.models.settings import UserSettings
from app.services.ai_provider import AIMessage, AIProviderError, get_ai_provider
from app.services.document_service import _ai_embeddings

logger = logging.getLogger(__name__)

MEMORY_CATEGORIES = {
    "general",
    "preference",
    "decision",
    "fact",
    "goal",
    "project",
    "instruction",
    "important_fact",
    "long_term_goal",
    "project_information",
}


class ExtractedMemory(BaseModel):
    """A validated candidate returned by the extraction model."""

    content: str = Field(min_length=3, max_length=1_000)
    category: str = "general"
    confidence: float = Field(ge=0, le=1)


class ExtractionResponse(BaseModel):
    """Expected structured output from the extraction model."""

    memories: list[ExtractedMemory] = Field(default_factory=list)


class MemorySearchResult(BaseModel):
    """A user-scoped relevant memory with its query-time ranking score."""

    id: str
    content: str
    category: str
    source: str
    is_pinned: bool
    relevance_score: float


async def memory_intelligence_enabled(db: AsyncSession, user_id: str) -> bool:
    """Return whether this user permits automatic memory processing.

    A missing settings row is treated as the established default (enabled), while
    an explicit opt-out disables extraction, retrieval, and vector work.
    """
    scalar = getattr(db, "scalar", None)
    if scalar is None:
        # Lightweight test doubles and older integrations without a settings
        # query capability retain the established enabled default.
        return True
    preference = await scalar(
        select(UserSettings.ai_memory_enabled).where(UserSettings.user_id == user_id)
    )
    return preference is not False


def _collection() -> Any | None:
    """Open the separately persisted Chroma collection for user memories."""
    try:
        import chromadb

        client = chromadb.PersistentClient(path=str(settings.chroma_path))
        return client.get_or_create_collection("memories", metadata={"hnsw:space": "cosine"})
    except Exception:
        logger.exception("Memory ChromaDB collection is unavailable; SQL fallback will be used")
        return None


def _normalise(content: str) -> str:
    return re.sub(r"\W+", " ", content.lower()).strip()


def _query_terms(query: str) -> list[str]:
    return [term for term in re.findall(r"\w+", query.lower()) if len(term) > 2][:10]


def _has_semantic_duplicate(
    collection: Any | None, user_id: str, embedding: list[float] | None
) -> bool:
    """Check only the nearest existing vector, avoiding a full-memory scan."""
    if collection is None or embedding is None:
        return False
    try:
        result = collection.query(
            query_embeddings=[embedding],
            n_results=1,
            where={"user_id": user_id},
        )
        distances = result.get("distances", [[]])[0] or []
        return bool(distances) and (1 - float(distances[0])) >= settings.memory_duplicate_similarity
    except Exception:
        logger.exception("Memory semantic duplicate check failed")
        return False


def remove_memory_from_index(memory_id: str) -> None:
    """Remove a memory vector after the database row is deleted."""
    collection = _collection()
    if collection is None:
        return
    try:
        collection.delete(ids=[memory_id])
    except Exception:
        logger.exception("Could not remove memory from ChromaDB", extra={"memory_id": memory_id})


async def index_memory_by_id(memory_id: str) -> None:
    """Embed and upsert a committed memory without holding a request session open."""
    async with async_session_factory() as db:
        memory = await db.get(Memory, memory_id)
        if (
            memory is None
            or memory.review_status != "approved"
            or not await memory_intelligence_enabled(db, memory.user_id)
        ):
            return
        embeddings = await _ai_embeddings([memory.content], task_type="SEMANTIC_SIMILARITY")
        collection = _collection()
        if embeddings is None or collection is None:
            return
        try:
            collection.upsert(
                ids=[memory.id],
                documents=[memory.content],
                embeddings=embeddings,
                metadatas=[{
                    "user_id": memory.user_id,
                    "memory_id": memory.id,
                    "category": memory.category,
                    "is_pinned": memory.is_pinned,
                }],
            )
            memory.embedding_id = memory.id
            await db.commit()
        except Exception:
            logger.exception("Memory vector indexing failed", extra={"memory_id": memory.id})


async def reindex_user_memories(user_id: str) -> int:
    """Index all memories owned by one user; useful after importing old data."""
    async with async_session_factory() as db:
        memory_ids = list((await db.scalars(
            select(Memory.id).where(Memory.user_id == user_id)
        )).all())
    for memory_id in memory_ids:
        await index_memory_by_id(memory_id)
    return len(memory_ids)


async def search_user_memories(
    db: AsyncSession, user_id: str, query: str, limit: int = 5, workspace_id: str | None = None
) -> list[MemorySearchResult]:
    """Return semantically ranked memories with a user-scoped SQL fallback."""
    limit = max(1, min(limit, 20))
    query = query.strip()
    if not query:
        return []
    if not await memory_intelligence_enabled(db, user_id):
        return []
    collection = _collection()
    embeddings = await _ai_embeddings([query], task_type="SEMANTIC_SIMILARITY")
    candidates: dict[str, float] = {}
    if collection is not None and embeddings is not None:
        try:
            result = collection.query(
                query_embeddings=embeddings,
                n_results=limit * 3,
                where={"user_id": user_id},
            )
            metadatas = result.get("metadatas", [[]])[0] or []
            distances = result.get("distances", [[]])[0] or []
            for metadata, distance in zip(metadatas, distances):
                if metadata and metadata.get("memory_id"):
                    candidates[str(metadata["memory_id"])] = max(
                        candidates.get(str(metadata["memory_id"]), -1), 1 - float(distance)
                    )
        except Exception:
            logger.exception("Memory ChromaDB search failed; using SQL fallback")

    terms = _query_terms(query)
    has_vector_candidates = bool(candidates)
    if has_vector_candidates:
        mem_scope = (or_(Memory.workspace_id == workspace_id, Memory.workspace_id.is_(None)) if workspace_id else Memory.workspace_id.is_(None))
        rows = list((await db.scalars(
            select(Memory).where(
                Memory.user_id == user_id,
                Memory.review_status == "approved",
                Memory.id.in_(candidates),
                mem_scope,
            )
        )).all())
    else:
        mem_scope = (or_(Memory.workspace_id == workspace_id, Memory.workspace_id.is_(None)) if workspace_id else Memory.workspace_id.is_(None))
        rows = list((await db.scalars(
            select(Memory).where(
                Memory.user_id == user_id,
                Memory.review_status == "approved",
                mem_scope,
            ).order_by(Memory.is_pinned.desc(), Memory.updated_at.desc()).limit(250)
        )).all())
        candidates = {
            memory.id: sum(memory.content.lower().count(term) for term in terms) / max(1, len(terms))
            for memory in rows
        }

    mem_scope = (or_(Memory.workspace_id == workspace_id, Memory.workspace_id.is_(None)) if workspace_id else Memory.workspace_id.is_(None))
    pinned = list((await db.scalars(
        select(Memory).where(
            Memory.user_id == user_id,
            Memory.review_status == "approved",
            Memory.is_pinned.is_(True),
            mem_scope,
        )
    )).all())
    memories = {memory.id: memory for memory in rows}
    memories.update({memory.id: memory for memory in pinned})
    ranked: list[MemorySearchResult] = []
    now = datetime.now(timezone.utc)
    for memory in memories.values():
        semantic_score = max(0.0, min(candidates.get(memory.id, 0.0), 1.0))
        if not has_vector_candidates and semantic_score <= 0 and not memory.is_pinned:
            continue
        confidence = getattr(memory, "confidence", None)
        confidence_score = confidence if confidence is not None else 1.0
        reference_date = (
            getattr(memory, "last_used_at", None)
            or getattr(memory, "updated_at", None)
            or getattr(memory, "created_at", None)
        )
        if reference_date is None:
            reference_date = now
        if reference_date.tzinfo is None:
            reference_date = reference_date.replace(tzinfo=timezone.utc)
        age_days = max(0.0, (now - reference_date).total_seconds() / 86_400)
        recency_score = math.exp(-age_days / settings.memory_rank_recency_days)
        usage_score = min(getattr(memory, "usage_count", 0) / settings.memory_rank_usage_saturation, 1.0)
        score = (
            semantic_score * settings.memory_rank_semantic_weight
            + (1.0 if memory.is_pinned else 0.0) * settings.memory_rank_pin_weight
            + confidence_score * settings.memory_rank_confidence_weight
            + recency_score * settings.memory_rank_recency_weight
            + usage_score * settings.memory_rank_usage_weight
        )
        if score <= 0 and not memory.is_pinned:
            continue
        ranked.append(MemorySearchResult(
            id=memory.id,
            content=memory.content,
            category=memory.category,
            source=memory.source,
            is_pinned=memory.is_pinned,
            relevance_score=round(score, 4),
        ))
    selected = sorted(ranked, key=lambda memory: memory.relevance_score, reverse=True)[:limit]
    if selected:
        selected_ids = [memory.id for memory in selected]
        selected_rows = [memory for memory in memories.values() if memory.id in selected_ids]
        for memory in selected_rows:
            memory.usage_count = getattr(memory, "usage_count", 0) + 1
            memory.last_used_at = now
    return selected


def _parse_extraction(raw: str) -> ExtractionResponse:
    """Extract strict JSON while tolerating a model-provided markdown fence."""
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end < start:
        raise ValueError("Extraction response did not contain JSON")
    parsed = ExtractionResponse.model_validate_json(raw[start : end + 1])
    parsed.memories = [
        memory for memory in parsed.memories
        if memory.category in MEMORY_CATEGORIES
        and memory.confidence >= settings.memory_extraction_min_confidence
    ][: settings.memory_extraction_max_items]
    return parsed


async def extract_memories_from_turn(
    user_id: str,
    chat_id: str,
    source_message_id: str,
    user_content: str,
    assistant_content: str,
    workspace_id: str | None = None,
) -> None:
    """Extract durable memories asynchronously after a successful chat response."""
    if not settings.ai_provider_configured:
        return
    user_content = user_content.strip()[: settings.memory_extraction_max_turn_chars]
    assistant_content = assistant_content.strip()[: settings.memory_extraction_max_turn_chars]
    if not user_content or not assistant_content:
        return
    prompt = f"""Extract only durable, useful information about the user or their work from this chat turn.
Allowed categories: preference, decision, fact, important_fact, goal, long_term_goal, project, project_information, instruction, general.
Do not save transient requests, assistant speculation, passwords, access tokens, payment data, or sensitive personal details.
Return JSON only in this exact shape: {{\"memories\":[{{\"content\":\"...\",\"category\":\"fact\",\"confidence\":0.0}}]}}.

USER: {user_content}
ASSISTANT: {assistant_content}"""
    async with async_session_factory() as preference_db:
        if not await memory_intelligence_enabled(preference_db, user_id):
            return

    extracted: ExtractionResponse | None = None
    for attempt in range(1, settings.memory_extraction_max_attempts + 1):
        try:
            raw = await get_ai_provider().complete_text([
                AIMessage(role="system", content="You extract long-term workspace memories."),
                AIMessage(role="user", content=prompt),
            ])
            extracted = _parse_extraction(raw)
            break
        except (AIProviderError, ValueError, ValidationError, TypeError):
            if attempt == settings.memory_extraction_max_attempts:
                logger.exception("Automatic memory extraction failed", extra={"chat_id": chat_id, "attempts": attempt})
                return
            logger.warning("Automatic memory extraction failed; retrying", extra={"chat_id": chat_id, "attempt": attempt})
            await asyncio.sleep(settings.memory_extraction_retry_delay_seconds * attempt)

    if extracted is None:
        return

    candidate_embeddings = await _ai_embeddings(
        [candidate.content for candidate in extracted.memories], task_type="SEMANTIC_SIMILARITY"
    )
    memory_collection = _collection()

    async with async_session_factory() as db:
        already_processed = await db.scalar(
            select(Memory.id).where(Memory.source_message_id == source_message_id).limit(1)
        )
        if already_processed:
            return
        if not await memory_intelligence_enabled(db, user_id):
            return
        existing = {
            _normalise(content)
            for content in (await db.scalars(
                select(Memory.content).where(
                    Memory.user_id == user_id,
                    Memory.review_status != "rejected",
                ).limit(500)
            )).all()
        }
        created_ids: list[str] = []
        for index, candidate in enumerate(extracted.memories):
            normalised = _normalise(candidate.content)
            embedding = (
                candidate_embeddings[index]
                if candidate_embeddings is not None and index < len(candidate_embeddings)
                else None
            )
            if (
                not normalised
                or normalised in existing
                or _has_semantic_duplicate(memory_collection, user_id, embedding)
            ):
                continue
            memory = Memory(
                user_id=user_id,
                content=candidate.content.strip(),
                category=candidate.category,
                source="auto",
                source_chat_id=chat_id,
                source_message_id=source_message_id,
                confidence=candidate.confidence,
                review_status="pending",
                workspace_id=workspace_id,
            )
            db.add(memory)
            await db.flush()
            if workspace_id:
                from app.models.workspace import WorkspaceResource
                db.add(WorkspaceResource(
                    workspace_id=workspace_id,
                    resource_type="memory",
                    resource_id=memory.id,
                ))
            created_ids.append(memory.id)
            existing.add(normalised)
        await db.commit()
