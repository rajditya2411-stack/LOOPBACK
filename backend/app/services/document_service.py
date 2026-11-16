"""Extraction, embedding, and user-scoped retrieval for uploaded documents."""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Any

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import async_session_factory
from app.models.document import Document, DocumentChunk
from app.schemas.document import DocumentSearchResult
from app.services.ai_provider import AIProviderError, get_ai_provider

logger = logging.getLogger(__name__)

# Gemini's embedding space is incompatible with the former Workers AI index.
# A versioned collection keeps prior vectors from contaminating retrieval and
# lets startup reconciliation safely re-index completed documents.
DOCUMENT_COLLECTION_NAME = "document_chunks_gemini_1024_v1"
_MAX_CHUNKS_PER_DOCUMENT = 2


def _chunk_text(text: str) -> list[str]:
    """Split normalized text into overlapping, word-safe retrieval chunks."""
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    size, overlap = settings.document_chunk_size, settings.document_chunk_overlap
    if size <= 0:
        raise ValueError("document_chunk_size must be greater than zero")
    if overlap < 0 or overlap >= size:
        raise ValueError("document_chunk_overlap must be non-negative and smaller than chunk size")
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(start + size, len(normalized))
        if end < len(normalized):
            boundary = normalized.rfind(" ", start, end)
            if boundary > start:
                end = boundary
        chunks.append(normalized[start:end].strip())
        if end == len(normalized):
            break
        start = max(end - overlap, start + 1)
    return chunks


def _extract_text(path: Path, file_type: str) -> tuple[str, int | None]:
    """Extract text from supported local document types."""
    if file_type in {"txt", "md"}:
        return path.read_text(encoding="utf-8", errors="replace"), 1
    if file_type == "pdf":
        import fitz  # PyMuPDF

        pdf = fitz.open(path)
        try:
            reader = None
            pages: list[str] = []
            for page in pdf:
                page_text = page.get_text("text").strip()
                if not page_text:
                    # Scanned PDFs have no text layer, so render only those
                    # pages and send their pixels through the existing OCR path.
                    import easyocr
                    import numpy as np

                    if reader is None:
                        reader = easyocr.Reader(["en"], gpu=False)
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(
                        pixmap.height, pixmap.width, pixmap.n
                    )
                    page_text = "\n".join(reader.readtext(image, detail=0))
                pages.append(page_text)
            text = "\n".join(pages)
            return "\f".join(pages), len(pdf)
        finally:
            pdf.close()
    if file_type in {"png", "jpg", "jpeg"}:
        import easyocr

        reader = easyocr.Reader(["en"], gpu=False)
        return "\n".join(reader.readtext(str(path), detail=0)), 1
    raise ValueError(f"Unsupported document type: {file_type}")


async def _ai_embeddings(
    texts: list[str], *, task_type: str | None = None
) -> list[list[float]] | None:
    """Embed text through the configured provider with bounded retry handling."""
    if not settings.ai_provider_configured:
        return None
    provider = get_ai_provider()
    if not provider.supports_embeddings:
        logger.debug("Configured AI provider does not support embeddings; using SQL retrieval fallback")
        return None
    for attempt in range(3):
        try:
            return await provider.embed_texts(texts, task_type=task_type)
        except (AIProviderError, ValueError, TypeError):
            if attempt == 2:
                logger.exception("AI provider embedding request failed after retries")
                return None
            logger.warning(
                "AI provider embedding request failed; retrying",
                extra={"attempt": attempt + 1, "text_count": len(texts)},
            )
            await asyncio.sleep(attempt + 1)
    return None


def _collection() -> Any | None:
    """Open the persistent collection lazily so the app works without Chroma installed."""
    try:
        import chromadb

        client = chromadb.PersistentClient(path=str(settings.chroma_path))
        return client.get_or_create_collection(
            DOCUMENT_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    except Exception:
        logger.exception("ChromaDB is unavailable; SQL fallback search will be used")
        return None


def remove_document_from_index(document_id: str) -> None:
    """Remove one document's vectors when its source document is deleted."""
    collection = _collection()
    if collection is None:
        return
    try:
        collection.delete(where={"document_id": document_id})
    except Exception:
        logger.exception("Could not remove document from ChromaDB", extra={"document_id": document_id})


async def repair_missing_document_sources() -> int:
    """Mark records with missing source files as recoverable failures.

    Extracted chunks may remain in SQLite for forensic recovery, but failed
    records are excluded from chat retrieval and clearly tell users to upload
    the source again instead of pretending the document is usable.
    """
    async with async_session_factory() as db:
        documents = list((await db.scalars(
            select(Document).where(Document.status != "failed")
        )).all())
        repaired = 0
        for document in documents:
            if Path(document.file_path).is_file():
                continue
            document.status = "failed"
            document.processing_error = "The original uploaded file is missing. Please upload it again."
            await db.execute(
                update(DocumentChunk)
                .where(DocumentChunk.document_id == document.id)
                .values(embedding_id=None)
            )
            remove_document_from_index(document.id)
            repaired += 1
        if repaired:
            await db.commit()
            logger.warning("Marked documents with missing source files as failed", extra={"count": repaired})
        return repaired


async def _store_document_vectors(
    document: Document,
    chunks_with_pages: list[tuple[str, int]],
    embedding_ids: list[str],
) -> None:
    """Embed and persist every chunk, or raise without changing DB status."""
    chunks = [chunk for chunk, _ in chunks_with_pages]
    embeddings = await _ai_embeddings(chunks, task_type="RETRIEVAL_DOCUMENT")
    if embeddings is None:
        raise RuntimeError("Could not generate document embeddings")
    if len(embeddings) != len(chunks):
        raise RuntimeError("Embedding count did not match document chunk count")

    collection = _collection()
    if collection is None:
        raise RuntimeError("ChromaDB is unavailable")

    # Upsert first, then remove only surplus old ids. A transient provider or
    # Chroma failure must not turn a previously searchable document into an
    # empty one.
    existing_ids = collection.get(where={"document_id": document.id}, include=[]).get("ids", [])
    collection.upsert(
        ids=embedding_ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=[
            {
                "user_id": document.user_id,
                "document_id": document.id,
                "document_title": document.title,
                "chunk_index": index,
                "page_number": page_number,
            }
            for index, (_, page_number) in enumerate(chunks_with_pages)
        ],
    )
    stored_ids = collection.get(ids=embedding_ids, include=[]).get("ids", [])
    if set(stored_ids) != set(embedding_ids):
        raise RuntimeError("ChromaDB did not persist every document vector")
    stale_ids = [vector_id for vector_id in existing_ids if vector_id not in set(embedding_ids)]
    if stale_ids:
        collection.delete(ids=stale_ids)
    logger.info(
        "Document vectors stored",
        extra={
            "document_id": document.id,
            "chunk_count": len(chunks),
            "embedding_count": len(embeddings),
            "chroma_insertion_success": True,
        },
    )


async def process_document(document_id: str) -> None:
    """Extract, chunk, and index a document after upload without blocking the request."""
    async with async_session_factory() as db:
        document = await db.get(Document, document_id)
        if document is None:
            return
        document.status = "processing"
        document.processing_error = None
        await db.commit()
        try:
            raw_text, pages = await asyncio.to_thread(_extract_text, Path(document.file_path), document.file_type)
            page_sections = raw_text.split("\f")
            chunks_with_pages = [
                (chunk, page_number)
                for page_number, page_text in enumerate(page_sections, start=1)
                for chunk in _chunk_text(page_text)
            ]
            chunks = [chunk for chunk, _ in chunks_with_pages]
            if not chunks:
                raise ValueError("No readable text was found in this document")

            await db.execute(DocumentChunk.__table__.delete().where(DocumentChunk.document_id == document.id))
            embedding_ids = [f"{document.id}:{index}" for index in range(len(chunks_with_pages))]
            chunk_rows = [
                DocumentChunk(
                    document_id=document.id,
                    content=chunk,
                    chunk_index=index,
                    page_number=page_number,
                    token_count=len(chunk.split()),
                    # This is only persisted once the matching vector write
                    # succeeds below.
                    embedding_id=None,
                )
                for index, (chunk, page_number) in enumerate(chunks_with_pages)
            ]
            db.add_all(chunk_rows)
            document.page_count = pages
            document.word_count = len(raw_text.replace("\f", " ").split())
            document.summary = raw_text.replace("\f", "\n").strip()[:500]

            logger.info(
                "Document parsed",
                extra={
                    "document_id": document.id,
                    "extracted_chunk_count": len(chunks),
                    "page_count": pages,
                },
            )

            provider = get_ai_provider()
            if settings.ai_provider_configured and provider.supports_embeddings:
                await _store_document_vectors(document, chunks_with_pages, embedding_ids)
                for chunk_row, embedding_id in zip(chunk_rows, embedding_ids):
                    chunk_row.embedding_id = embedding_id
            else:
                logger.info(
                    "Document stored without semantic index because embeddings are unavailable",
                    extra={"document_id": document.id, "chunk_count": len(chunks)},
                )
            document.status = "completed"
            document.processing_error = None
            await db.commit()
        except Exception as exc:
            logger.exception("Document processing failed", extra={"document_id": document_id})
            # Roll back uncommitted chunk changes so a failed re-index cannot
            # leave the database claiming a vector reference that does not exist.
            await db.rollback()
            document = await db.get(Document, document_id)
            if document is None:
                return
            document.status = "failed"
            document.processing_error = str(exc)[:500] or "An unexpected processing error occurred."
            await db.commit()


async def reconcile_document_indexes() -> None:
    """Backfill the current versioned index for completed documents at startup."""
    if not settings.ai_provider_configured or not get_ai_provider().supports_embeddings:
        logger.info("Skipping document index reconciliation because embeddings are unavailable")
        return
    collection = _collection()
    if collection is None:
        return
    async with async_session_factory() as db:
        documents = list((await db.scalars(
            select(Document).where(Document.status == "completed").order_by(Document.created_at)
        )).all())
        for document in documents:
            chunks = list((await db.scalars(
                select(DocumentChunk)
                .where(DocumentChunk.document_id == document.id)
                .order_by(DocumentChunk.chunk_index)
            )).all())
            if not chunks:
                document.status = "failed"
                document.processing_error = "Document has no extracted chunks to index."
                await db.commit()
                logger.error("Completed document has no chunks", extra={"document_id": document.id})
                continue
            embedding_ids = [f"{document.id}:{chunk.chunk_index}" for chunk in chunks]
            try:
                indexed = collection.get(ids=embedding_ids, include=[]).get("ids", [])
                if len(indexed) == len(embedding_ids):
                    continue
                await _store_document_vectors(
                    document,
                    [(chunk.content, chunk.page_number or 1) for chunk in chunks],
                    embedding_ids,
                )
                for chunk, embedding_id in zip(chunks, embedding_ids):
                    chunk.embedding_id = embedding_id
                document.processing_error = None
                await db.commit()
                logger.info("Document index reconciled", extra={"document_id": document.id, "chunk_count": len(chunks)})
            except Exception as exc:
                logger.exception("Document index reconciliation failed", extra={"document_id": document.id})
                document.status = "failed"
                document.processing_error = str(exc)[:500] or "Document indexing failed."
                await db.commit()


async def search_user_documents(
    db: AsyncSession, user_id: str, query: str, limit: int = 5, allowed_document_ids: list[str] | None = None
) -> list[DocumentSearchResult]:
    """Search ChromaDB with a strict user metadata filter; fall back to SQL text search."""
    query = query.strip()
    if not query:
        return []
    limit = max(1, min(limit, 50))
    terms = [term for term in re.findall(r"\w+", query.lower()) if term]
    if not terms:
        return []
    if allowed_document_ids is not None and len(allowed_document_ids) == 0:
        return []
    collection = _collection()
    embeddings = await _ai_embeddings([query], task_type="RETRIEVAL_QUERY")
    if collection is not None and embeddings is not None:
        try:
            kwargs: dict[str, Any] = {
                "query_embeddings": embeddings,
                # Fetch extra candidates, then keep a small number per source
                # so a large first document cannot consume the whole RAG budget.
                "n_results": min(limit * 8, 100),
                "where": {"user_id": user_id},
            }
            result = collection.query(**kwargs)
            ids = result.get("metadatas", [[]])[0] or []
            documents = result.get("documents", [[]])[0] or []
            distances = result.get("distances", [[]])[0] or []
            document_ids = [str(metadata["document_id"]) for metadata in ids if metadata and metadata.get("document_id")]
            db_docs = {doc.id: doc for doc in (await db.scalars(
                select(Document).where(
                    Document.id.in_(document_ids),
                    Document.user_id == user_id,
                    Document.status == "completed",
                )
            )).all()}
            matches: list[DocumentSearchResult] = []
            seen: set[tuple[str, int]] = set()
            chunks_per_document: dict[str, int] = {}
            for metadata, content, distance in zip(ids, documents, distances):
                if not metadata or not content or not metadata.get("document_id"):
                    continue
                document_id = str(metadata["document_id"])
                if allowed_document_ids is not None and document_id not in allowed_document_ids:
                    continue
                score = 1 - float(distance)
                key = (document_id, int(metadata.get("chunk_index", 0)))
                if (
                    document_id not in db_docs
                    or key in seen
                    or score < settings.rag_min_relevance
                    or chunks_per_document.get(document_id, 0) >= _MAX_CHUNKS_PER_DOCUMENT
                ):
                    continue
                seen.add(key)
                chunks_per_document[document_id] = chunks_per_document.get(document_id, 0) + 1
                matches.append(DocumentSearchResult(
                    document_id=document_id,
                    document_title=db_docs[document_id].title,
                    chunk_content=content,
                    chunk_index=int(metadata.get("chunk_index", 0)),
                    relevance_score=score,
                    page_number=metadata.get("page_number"),
                ))
            logger.info(
                "Document retrieval complete",
                extra={
                    "user_id": user_id,
                    "retrieval_candidate_count": len(ids),
                    "retrieved_document_ids": list(chunks_per_document),
                    "retrieved_chunk_count": len(matches),
                },
            )
            return matches[:limit]
        except Exception:
            logger.exception("ChromaDB search failed; using SQL fallback")

    rows = (await db.execute(
        select(DocumentChunk, Document)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            Document.user_id == user_id,
            Document.status == "completed",
            *((Document.id.in_(allowed_document_ids),) if allowed_document_ids is not None else ()),
            or_(*(
                condition
                for term in terms
                for condition in (
                    DocumentChunk.content.ilike(f"%{term}%"),
                    Document.title.ilike(f"%{term}%"),
                )
            )),
        )
        .limit(max(limit * 20, 100))
    )).all()
    ranked = sorted(
        rows,
        key=lambda pair: (
            sum(pair[0].content.lower().count(term) for term in terms)
            + 4 * sum(pair[1].title.lower().count(term) for term in terms)
        ),
        reverse=True,
    )
    matches: list[DocumentSearchResult] = []
    chunks_per_document: dict[str, int] = {}
    for chunk, document in ranked:
        if chunks_per_document.get(document.id, 0) >= _MAX_CHUNKS_PER_DOCUMENT:
            continue
        chunks_per_document[document.id] = chunks_per_document.get(document.id, 0) + 1
        matches.append(DocumentSearchResult(
            document_id=document.id,
            document_title=document.title,
            chunk_content=chunk.content,
            chunk_index=chunk.chunk_index,
            relevance_score=0.5,
            page_number=chunk.page_number,
        ))
        if len(matches) == limit:
            break
    logger.info(
        "Document SQL fallback retrieval complete",
        extra={
            "user_id": user_id,
            "retrieval_candidate_count": len(rows),
            "retrieved_document_ids": list(chunks_per_document),
            "retrieved_chunk_count": len(matches),
        },
    )
    return matches
