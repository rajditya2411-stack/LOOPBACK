"""Documents API endpoints."""

import logging
import uuid
from typing import Any
from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from app.core.config import settings
from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.models.document import Document
from app.models.document import DocumentChunk
from app.schemas.document import DocumentDetailRead, DocumentRead, DocumentSearchResult
from app.services.document_service import (
    process_document,
    remove_document_from_index,
    search_user_documents,
)

router = APIRouter(prefix="/documents", tags=["Documents"])
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"pdf", "txt", "md", "png", "jpg", "jpeg"}

@router.get("", response_model=list[DocumentRead])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List all documents for the current user."""
    result = await db.execute(
        select(Document).where(Document.user_id == current_user.id).order_by(Document.created_at.desc())
    )
    return result.scalars().all()

@router.post("/upload", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Upload a new document."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Only PDF, TXT, MD, PNG, JPG, and JPEG files are supported")
    
    # Generate unique filename to prevent collisions
    safe_name = Path(file.filename).name
    unique_filename = f"{uuid.uuid4()}_{safe_name}"
    file_path = settings.upload_path / "documents" / unique_filename
    bytes_written = 0
    try:
        with open(file_path, "xb") as buffer:
            while chunk := await file.read(1024 * 1024):
                bytes_written += len(chunk)
                if bytes_written > settings.max_upload_size_bytes:
                    raise HTTPException(status_code=413, detail="File exceeds the upload size limit")
                buffer.write(chunk)
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    
    # Create database record
    document = Document(
        user_id=current_user.id,
        title=safe_name,
        file_path=str(file_path),
        file_type=file_extension,
        file_size=bytes_written,
        status="pending",
    )
    
    db.add(document)
    await db.commit()
    await db.refresh(document)
    logger.info(
        "Document uploaded; scheduling processing",
        extra={"document_id": document.id, "user_id": current_user.id, "file_size": bytes_written},
    )
    
    if background_tasks is None:
        await process_document(str(document.id))
    else:
        background_tasks.add_task(process_document, str(document.id))
    return document


@router.get("/search", response_model=list[DocumentSearchResult])
async def search_documents(
    query: str,
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentSearchResult]:
    """Return user-scoped semantic document matches for a query."""
    if not query.strip():
        return []
    return await search_user_documents(db, current_user.id, query, min(max(limit, 1), 20))


@router.get("/{document_id}", response_model=DocumentDetailRead)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Return one user-owned document with a concise extracted-text preview."""
    document = await db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    preview_chunks = list(
        (await db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document.id)
            .order_by(DocumentChunk.chunk_index)
            .limit(5)
        )).all()
    )
    return DocumentDetailRead.model_validate(document).model_copy(
        update={"preview_chunks": preview_chunks}
    )


@router.post("/{document_id}/retry", response_model=DocumentRead)
async def retry_document_processing(
    document_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Retry processing a failed user-owned document without re-uploading it."""
    document = await db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if document.status != "failed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only failed documents can be retried")
    if not Path(document.file_path).is_file():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The original document file is no longer available")

    document.status = "pending"
    document.processing_error = None
    await db.commit()
    await db.refresh(document)
    background_tasks.add_task(process_document, document.id)
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a user-owned document, its stored file, and any vector index entries."""
    document = await db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    file_path = Path(document.file_path)
    await db.delete(document)
    await db.commit()
    file_path.unlink(missing_ok=True)
    remove_document_from_index(document_id)
