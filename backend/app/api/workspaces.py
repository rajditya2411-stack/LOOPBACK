"""Workspace switching, invitations, roles, and explicit resource sharing."""

from __future__ import annotations

import html
import io
import json
import os
import secrets
import tempfile
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import fitz
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.chat import Chat, Message
from app.models.document import Document
from app.models.goal import Goal
from app.models.memory import Memory
from app.models.settings import UserSettings
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceInvitation, WorkspaceMember, WorkspaceResource
from app.schemas.workspace import (
    ActiveWorkspaceUpdate,
    WorkspaceAvailableResource,
    WorkspaceCreate,
    WorkspaceGeneratePdfRequest,
    WorkspaceInvitationRead,
    WorkspaceMemberAdd,
    WorkspaceMemberRead,
    WorkspaceMemberUpdate,
    WorkspaceRead,
    WorkspaceResourceBatchCreate,
    WorkspaceResourceCreate,
    WorkspaceResourceRead,
    WorkspaceUpdate,
)
from app.services.ai_provider import AIProviderError, ProviderConfig, ProviderManager
from app.services.email_service import send_workspace_invitation_email

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])

ROLE_LEVELS = {"viewer": 1, "editor": 2, "admin": 3, "owner": 4}
RESOURCE_MODELS = {"task": Task, "goal": Goal, "document": Document, "memory": Memory, "chat": Chat}


async def _member_or_error(
    db: AsyncSession, workspace_id: str, user_id: str, minimum_role: str = "viewer"
) -> WorkspaceMember:
    member = await db.scalar(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id)
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this workspace")
    if ROLE_LEVELS.get(member.role, 0) < ROLE_LEVELS[minimum_role]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your workspace role does not permit this action")
    return member


async def _workspace_or_404(db: AsyncSession, workspace_id: str) -> Workspace:
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


async def _workspace_read(db: AsyncSession, workspace: Workspace, user: User) -> Workspace:
    workspace.member_count = await db.scalar(select(func.count(WorkspaceMember.id)).where(WorkspaceMember.workspace_id == workspace.id)) or 0
    workspace.resource_count = await db.scalar(select(func.count(WorkspaceResource.id)).where(WorkspaceResource.workspace_id == workspace.id)) or 0
    member = await db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user.id))
    workspace.role = member.role if member else None
    workspace.is_active = user.active_workspace_id == workspace.id
    return workspace


async def _resource_label(db: AsyncSession, resource: WorkspaceResource) -> tuple[str, str | None]:
    model = RESOURCE_MODELS.get(resource.resource_type)
    if not model:
        return "Unknown resource", None
    item = await db.get(model, resource.resource_id)
    if item is None:
        return "Unavailable resource", "The source resource was deleted"
    if resource.resource_type == "document":
        return item.title, f"{item.file_type.upper()} document"
    if resource.resource_type == "memory":
        return item.content[:120], item.category
    if resource.resource_type == "chat":
        return item.title, "AI Chat Thread"
    if resource.resource_type == "goal":
        return item.title, f"{round(item.progress * 100)}% complete"
    return item.title, f"{item.status.replace('_', ' ')} task"


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Workspace]:
    """List all workspaces available to the user, including their role and active state."""
    workspaces = list((await db.scalars(
        select(Workspace).join(WorkspaceMember).where(WorkspaceMember.user_id == current_user.id).order_by(Workspace.updated_at.desc())
    )).all())
    return [await _workspace_read(db, workspace, current_user) for workspace in workspaces]


@router.get("/active", response_model=WorkspaceRead | None)
async def get_active_workspace(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Workspace | None:
    """Return the selected collaboration context, if one is active."""
    if not current_user.active_workspace_id:
        return None
    workspace = await db.get(Workspace, current_user.active_workspace_id)
    if workspace is None:
        current_user.active_workspace_id = None
        await db.commit()
        return None
    await _member_or_error(db, workspace.id, current_user.id)
    return await _workspace_read(db, workspace, current_user)


@router.put("/active", response_model=WorkspaceRead | None)
async def set_active_workspace(data: ActiveWorkspaceUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Workspace | None:
    """Switch collaboration context without changing ownership of personal data."""
    if data.workspace_id is None:
        current_user.active_workspace_id = None
        await db.commit()
        return None
    workspace = await _workspace_or_404(db, data.workspace_id)
    await _member_or_error(db, workspace.id, current_user.id)
    current_user.active_workspace_id = workspace.id
    await db.commit()
    return await _workspace_read(db, workspace, current_user)


@router.get("/invitations/mine", response_model=list[WorkspaceInvitationRead])
async def list_my_invitations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[WorkspaceInvitationRead]:
    invitations = list((await db.scalars(
        select(WorkspaceInvitation).where(WorkspaceInvitation.email == current_user.email, WorkspaceInvitation.status == "pending").order_by(WorkspaceInvitation.created_at.desc())
    )).all())
    now = datetime.now(timezone.utc)
    response: list[WorkspaceInvitationRead] = []
    for invitation in invitations:
        if invitation.expires_at.replace(tzinfo=timezone.utc) < now:
            invitation.status = "expired"
            continue
        workspace = await db.get(Workspace, invitation.workspace_id)
        response.append(WorkspaceInvitationRead.model_validate(invitation).model_copy(update={"workspace_name": workspace.name if workspace else None}))
    await db.commit()
    return response


@router.post("/invitations/{token}/accept", response_model=WorkspaceRead)
async def accept_invitation(token: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Workspace:
    invitation = await db.scalar(select(WorkspaceInvitation).where(WorkspaceInvitation.token == token))
    if invitation is None or invitation.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found or no longer active")
    if invitation.email.lower() != current_user.email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invitation belongs to a different email address")
    expires_at = invitation.expires_at.replace(tzinfo=timezone.utc) if invitation.expires_at.tzinfo is None else invitation.expires_at
    if expires_at < datetime.now(timezone.utc):
        invitation.status = "expired"
        await db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This invitation has expired")
    workspace = await _workspace_or_404(db, invitation.workspace_id)
    member = await db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == current_user.id))
    if member is None:
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=current_user.id, role=invitation.role))
    invitation.status = "accepted"
    current_user.active_workspace_id = workspace.id
    await db.commit()
    return await _workspace_read(db, workspace, current_user)


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def create_workspace(data: WorkspaceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Workspace:
    workspace = Workspace(**data.model_dump(), owner_id=current_user.id)
    db.add(workspace)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=current_user.id, role="owner"))
    current_user.active_workspace_id = workspace.id
    await db.commit()
    return await _workspace_read(db, workspace, current_user)


@router.put("/{workspace_id}", response_model=WorkspaceRead)
async def update_workspace(workspace_id: str, data: WorkspaceUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Workspace:
    workspace = await _workspace_or_404(db, workspace_id)
    await _member_or_error(db, workspace_id, current_user.id, "admin")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(workspace, field, value)
    await db.commit()
    return await _workspace_read(db, workspace, current_user)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_workspace(workspace_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> None:
    workspace = await _workspace_or_404(db, workspace_id)
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the workspace owner can delete it")
    if current_user.active_workspace_id == workspace.id:
        current_user.active_workspace_id = None
    await db.delete(workspace)
    await db.commit()


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberRead])
async def list_workspace_members(workspace_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[WorkspaceMember]:
    await _member_or_error(db, workspace_id, current_user.id)
    members = list((await db.scalars(
        select(WorkspaceMember).options(selectinload(WorkspaceMember.user)).where(WorkspaceMember.workspace_id == workspace_id).order_by(WorkspaceMember.joined_at)
    )).all())
    for member in members:
        member.user_name = member.user.full_name if member.user else None
        member.user_email = member.user.email if member.user else None
    return members


@router.put("/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberRead)
async def update_workspace_member(workspace_id: str, member_id: str, data: WorkspaceMemberUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> WorkspaceMember:
    actor = await _member_or_error(db, workspace_id, current_user.id, "admin")
    member = await db.scalar(select(WorkspaceMember).where(WorkspaceMember.id == member_id, WorkspaceMember.workspace_id == workspace_id))
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.role == "owner" or (actor.role != "owner" and data.role == "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an owner can make this role change")
    member.role = data.role
    await db.commit()
    return member


@router.delete("/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_workspace_member(workspace_id: str, member_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> None:
    actor = await _member_or_error(db, workspace_id, current_user.id, "admin")
    member = await db.scalar(select(WorkspaceMember).where(WorkspaceMember.id == member_id, WorkspaceMember.workspace_id == workspace_id))
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.role == "owner" or (actor.role != "owner" and member.role == "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an owner can remove this member")
    await db.delete(member)
    await db.commit()


@router.get("/{workspace_id}/invitations", response_model=list[WorkspaceInvitationRead])
async def list_workspace_invitations(workspace_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[WorkspaceInvitationRead]:
    await _member_or_error(db, workspace_id, current_user.id, "admin")
    workspace = await _workspace_or_404(db, workspace_id)
    invitations = list((await db.scalars(select(WorkspaceInvitation).where(WorkspaceInvitation.workspace_id == workspace_id).order_by(WorkspaceInvitation.created_at.desc()))).all())
    return [WorkspaceInvitationRead.model_validate(invitation).model_copy(update={"workspace_name": workspace.name, "accept_url": f"{settings.frontend_url.rstrip('/')}/workspaces?invite={invitation.token}"}) for invitation in invitations]


@router.post("/{workspace_id}/invitations", response_model=WorkspaceInvitationRead, status_code=status.HTTP_201_CREATED)
async def invite_to_workspace(workspace_id: str, data: WorkspaceMemberAdd, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> WorkspaceInvitationRead:
    await _member_or_error(db, workspace_id, current_user.id, "admin")
    workspace = await _workspace_or_404(db, workspace_id)
    email = data.user_email.strip().lower()
    existing_user = await db.scalar(select(User).where(User.email == email))
    if existing_user and await db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == existing_user.id)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This user is already a workspace member")
    existing = await db.scalar(select(WorkspaceInvitation).where(WorkspaceInvitation.workspace_id == workspace_id, WorkspaceInvitation.email == email, WorkspaceInvitation.status == "pending"))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A pending invitation already exists for this email")
    invitation = WorkspaceInvitation(workspace_id=workspace_id, email=email, role=data.role, token=secrets.token_urlsafe(32), invited_by_id=current_user.id, expires_at=datetime.now(timezone.utc) + timedelta(days=7))
    db.add(invitation)
    await db.commit()
    accept_url = f"{settings.frontend_url.rstrip('/')}/workspaces?invite={invitation.token}"
    background_tasks.add_task(send_workspace_invitation_email, email, workspace.name, accept_url)
    return WorkspaceInvitationRead.model_validate(invitation).model_copy(update={"workspace_name": workspace.name, "accept_url": accept_url})


@router.get("/{workspace_id}/resources", response_model=list[WorkspaceResourceRead])
async def list_workspace_resources(workspace_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[WorkspaceResourceRead]:
    await _member_or_error(db, workspace_id, current_user.id)
    resources = list((await db.scalars(select(WorkspaceResource).where(WorkspaceResource.workspace_id == workspace_id).order_by(WorkspaceResource.created_at.desc()))).all())
    output: list[WorkspaceResourceRead] = []
    for resource in resources:
        title, subtitle = await _resource_label(db, resource)
        output.append(WorkspaceResourceRead.model_validate(resource).model_copy(update={"title": title, "subtitle": subtitle}))
    return output


@router.get("/{workspace_id}/shareable-resources", response_model=list[WorkspaceAvailableResource])
async def list_shareable_resources(workspace_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[WorkspaceAvailableResource]:
    """List the caller's own recent resources they may explicitly share with this workspace."""
    await _member_or_error(db, workspace_id, current_user.id, "editor")
    output: list[WorkspaceAvailableResource] = []
    tasks = list((await db.scalars(select(Task).where(Task.user_id == current_user.id).order_by(Task.updated_at.desc()).limit(50))).all())
    goals = list((await db.scalars(select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.updated_at.desc()).limit(50))).all())
    documents = list((await db.scalars(select(Document).where(Document.user_id == current_user.id).order_by(Document.updated_at.desc()).limit(50))).all())
    memories = list((await db.scalars(select(Memory).where(Memory.user_id == current_user.id).order_by(Memory.updated_at.desc()).limit(50))).all())
    chats = list((await db.scalars(select(Chat).where(Chat.user_id == current_user.id).order_by(Chat.updated_at.desc()).limit(50))).all())
    output.extend(WorkspaceAvailableResource(resource_type="document", resource_id=item.id, title=item.title, subtitle=f"{item.file_type.upper()} ({round(item.file_size / 1024, 1)} KB)") for item in documents)
    output.extend(WorkspaceAvailableResource(resource_type="chat", resource_id=item.id, title=item.title, subtitle="AI Study Conversation") for item in chats)
    output.extend(WorkspaceAvailableResource(resource_type="goal", resource_id=item.id, title=item.title, subtitle=f"{round(item.progress * 100)}% Milestone") for item in goals)
    output.extend(WorkspaceAvailableResource(resource_type="task", resource_id=item.id, title=item.title, subtitle=f"{item.status.replace('_', ' ').capitalize()} Task ({item.priority})") for item in tasks)
    output.extend(WorkspaceAvailableResource(resource_type="memory", resource_id=item.id, title=item.content[:120], subtitle=f"Cognitive Rule ({item.category})") for item in memories)
    return output


@router.post("/{workspace_id}/resources", response_model=WorkspaceResourceRead, status_code=status.HTTP_201_CREATED)
async def add_workspace_resource(workspace_id: str, data: WorkspaceResourceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> WorkspaceResourceRead:
    await _member_or_error(db, workspace_id, current_user.id, "editor")
    model = RESOURCE_MODELS.get(data.resource_type)
    if not model:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid resource type")
    resource_item = await db.scalar(select(model).where(model.id == data.resource_id, model.user_id == current_user.id))
    if resource_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Only your own resources can be shared")
    existing = await db.scalar(select(WorkspaceResource).where(WorkspaceResource.workspace_id == workspace_id, WorkspaceResource.resource_type == data.resource_type, WorkspaceResource.resource_id == data.resource_id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This resource is already shared with the workspace")
    resource = WorkspaceResource(workspace_id=workspace_id, resource_type=data.resource_type, resource_id=data.resource_id, added_by_id=current_user.id)
    db.add(resource)
    await db.commit()
    title, subtitle = await _resource_label(db, resource)
    return WorkspaceResourceRead.model_validate(resource).model_copy(update={"title": title, "subtitle": subtitle})


@router.post("/{workspace_id}/resources/batch", response_model=list[WorkspaceResourceRead], status_code=status.HTTP_201_CREATED)
async def add_workspace_resources_batch(
    workspace_id: str,
    data: WorkspaceResourceBatchCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceResourceRead]:
    """Add multiple resources to the workspace at once."""
    await _member_or_error(db, workspace_id, current_user.id, "editor")
    output: list[WorkspaceResourceRead] = []

    for item in data.resources:
        model = RESOURCE_MODELS.get(item.resource_type)
        if not model:
            continue
        resource_item = await db.scalar(select(model).where(model.id == item.resource_id, model.user_id == current_user.id))
        if resource_item is None:
            continue
        existing = await db.scalar(
            select(WorkspaceResource).where(
                WorkspaceResource.workspace_id == workspace_id,
                WorkspaceResource.resource_type == item.resource_type,
                WorkspaceResource.resource_id == item.resource_id,
            )
        )
        if existing:
            resource = existing
        else:
            resource = WorkspaceResource(
                workspace_id=workspace_id,
                resource_type=item.resource_type,
                resource_id=item.resource_id,
                added_by_id=current_user.id,
            )
            db.add(resource)
            await db.flush()

        title, subtitle = await _resource_label(db, resource)
        output.append(WorkspaceResourceRead.model_validate(resource).model_copy(update={"title": title, "subtitle": subtitle}))

    await db.commit()
    return output


@router.post("/{workspace_id}/resources/batch-remove", status_code=status.HTTP_200_OK)
async def remove_workspace_resources_batch(
    workspace_id: str,
    data: WorkspaceResourceBatchCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """Remove multiple resources from the workspace."""
    await _member_or_error(db, workspace_id, current_user.id, "editor")
    removed_count = 0
    for item in data.resources:
        resource = await db.scalar(
            select(WorkspaceResource).where(
                WorkspaceResource.workspace_id == workspace_id,
                WorkspaceResource.resource_type == item.resource_type,
                WorkspaceResource.resource_id == item.resource_id,
            )
        )
        if resource:
            await db.delete(resource)
            removed_count += 1
    await db.commit()
    return {"removed": removed_count}


@router.delete("/{workspace_id}/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_workspace_resource(workspace_id: str, resource_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> None:
    await _member_or_error(db, workspace_id, current_user.id, "editor")
    resource = await db.scalar(select(WorkspaceResource).where(WorkspaceResource.id == resource_id, WorkspaceResource.workspace_id == workspace_id))
    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared resource not found")
    await db.delete(resource)
    await db.commit()


@router.get("/{workspace_id}/export")
async def export_workspace_zip(
    workspace_id: str,
    resource_ids: str | None = Query(None, description="Comma-separated resource IDs to selectively export"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export a workspace and all its selected/shared resources into a 100% offline portable .zip bundle."""
    await _member_or_error(db, workspace_id, current_user.id, "viewer")
    workspace = await _workspace_or_404(db, workspace_id)

    query = select(WorkspaceResource).where(WorkspaceResource.workspace_id == workspace_id)
    if resource_ids:
        selected_ids = [r.strip() for r in resource_ids.split(",") if r.strip()]
        if selected_ids:
            query = query.where(WorkspaceResource.resource_id.in_(selected_ids))

    resources = list((await db.scalars(query)).all())

    manifest: dict[str, Any] = {
        "version": "1.1",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "workspace": {
            "id": workspace.id,
            "name": workspace.name,
            "description": workspace.description,
        },
        "tasks": [],
        "goals": [],
        "memories": [],
        "documents": [],
        "chats": [],
    }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for res in resources:
            if res.resource_type == "task":
                task = await db.get(Task, res.resource_id)
                if task:
                    manifest["tasks"].append({
                        "id": task.id,
                        "title": task.title,
                        "description": task.description,
                        "status": task.status,
                        "priority": task.priority,
                        "due_date": task.due_date.isoformat() if task.due_date else None,
                    })
            elif res.resource_type == "goal":
                goal = await db.get(Goal, res.resource_id)
                if goal:
                    manifest["goals"].append({
                        "id": goal.id,
                        "title": goal.title,
                        "description": goal.description,
                        "target_date": goal.target_date.isoformat() if goal.target_date else None,
                        "status": goal.status,
                        "progress": goal.progress,
                    })
            elif res.resource_type == "memory":
                mem = await db.get(Memory, res.resource_id)
                if mem:
                    manifest["memories"].append({
                        "id": mem.id,
                        "content": mem.content,
                        "category": mem.category,
                        "source": mem.source,
                        "is_pinned": mem.is_pinned,
                    })
            elif res.resource_type == "document":
                doc = await db.get(Document, res.resource_id)
                if doc:
                    doc_path = Path(doc.file_path) if Path(doc.file_path).is_absolute() else settings.upload_path / Path(doc.file_path).name
                    arc_name = f"documents/{Path(doc.file_path).name}"
                    if doc_path.exists():
                        zip_file.write(doc_path, arcname=arc_name)
                    manifest["documents"].append({
                        "id": doc.id,
                        "title": doc.title,
                        "file_type": doc.file_type,
                        "file_size": doc.file_size,
                        "summary": doc.summary,
                        "page_count": doc.page_count,
                        "word_count": doc.word_count,
                        "archive_path": arc_name if doc_path.exists() else None,
                    })
            elif res.resource_type == "chat":
                chat = await db.get(Chat, res.resource_id)
                if chat:
                    messages = list((await db.scalars(
                        select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at)
                    )).all())
                    manifest["chats"].append({
                        "id": chat.id,
                        "title": chat.title,
                        "created_at": chat.created_at.isoformat() if chat.created_at else None,
                        "messages": [
                            {
                                "role": m.role,
                                "content": m.content,
                                "created_at": m.created_at.isoformat() if m.created_at else None,
                                "citations": m.citations,
                            }
                            for m in messages
                        ],
                    })
                    # Human-readable Markdown transcript
                    safe_chat_name = "".join(c for c in chat.title if c.isalnum() or c in ("-", "_", " ")).strip() or "chat"
                    chat_lines = [f"# {chat.title}\n"]
                    for m in messages:
                        author = "User" if m.role == "user" else "LoopBack AI"
                        chat_lines.append(f"### {author}:\n{m.content}\n")
                        if m.citations:
                            chat_lines.append("**Grounding Citations:**")
                            for cit in m.citations:
                                chat_lines.append(f"- {cit.get('document_title', 'Document')} (Chunk #{cit.get('chunk_index', 0)})")
                            chat_lines.append("")
                    zip_file.writestr(f"chats/{safe_chat_name}.md", "\n".join(chat_lines))

        # Human-readable tasks summary
        if manifest["tasks"]:
            task_lines = [f"# Tasks for {workspace.name}\n", "| Title | Status | Priority | Due Date |", "| --- | --- | --- | --- |"]
            for t in manifest["tasks"]:
                task_lines.append(f"| {t['title']} | {t['status']} | {t['priority']} | {t['due_date'] or 'None'} |")
            zip_file.writestr("tasks/tasks_overview.md", "\n".join(task_lines))

        # Human-readable goals/milestones summary
        if manifest["goals"]:
            goal_lines = [f"# Milestones for {workspace.name}\n", "| Milestone | Progress | Target Date | Status |", "| --- | --- | --- | --- |"]
            for g in manifest["goals"]:
                goal_lines.append(f"| {g['title']} | {round(g['progress'] * 100)}% | {g['target_date'] or 'None'} | {g['status']} |")
            zip_file.writestr("milestones/milestones_overview.md", "\n".join(goal_lines))

        # Root README.md
        readme_lines = [
            f"# {workspace.name} — Workspace Context Bundle",
            f"\n{workspace.description or 'Exported from LoopBack Student Appliance.'}\n",
            f"**Exported at:** {manifest['exported_at']}",
            f"\n## Contents Summary",
            f"- **Uploaded Documents:** {len(manifest['documents'])} file(s)",
            f"- **AI Study Chats:** {len(manifest['chats'])} conversation(s)",
            f"- **Milestones / Goals:** {len(manifest['goals'])} item(s)",
            f"- **Kanban Tasks:** {len(manifest['tasks'])} task(s)",
            f"- **Cognitive Memories:** {len(manifest['memories'])} rule(s)",
            f"\n## Folder Structure",
            "- `manifest.json`: Machine-readable schema for 1-click restore into LoopBack.",
            "- `documents/`: Attached document files (PDF, DOCX, Markdown).",
            "- `chats/`: Human-readable Markdown transcripts of AI conversations.",
            "- `tasks/`: Markdown overview of tasks and execution states.",
            "- `milestones/`: Markdown overview of semester milestones.",
            f"\n---\n*LoopBack — Privacy-First Air-Gapped Academic Appliance.*"
        ]
        zip_file.writestr("README.md", "\n".join(readme_lines))
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

    zip_buffer.seek(0)
    safe_name = "".join(c for c in workspace.name if c.isalnum() or c in ("-", "_")).strip() or "workspace"
    filename = f"{safe_name}.loopback.zip"

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def import_workspace_zip(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceRead:
    """Import a .loopback.zip file completely offline and reconstruct the workspace."""
    content = await file.read()
    zip_buffer = io.BytesIO(content)

    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_file:
            if "manifest.json" not in zip_file.namelist():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workspace archive: manifest.json missing")
            manifest = json.loads(zip_file.read("manifest.json").decode("utf-8"))

            ws_meta = manifest.get("workspace", {})
            raw_name = ws_meta.get("name", "Imported Workspace")
            ws_name = raw_name if raw_name.endswith("(Imported)") else f"{raw_name} (Imported)"
            ws_desc = ws_meta.get("description", "Imported from local archive")

            workspace = Workspace(name=ws_name, description=ws_desc, owner_id=current_user.id)
            db.add(workspace)
            await db.flush()

            owner_member = WorkspaceMember(workspace_id=workspace.id, user_id=current_user.id, role="owner")
            db.add(owner_member)

            # Reconstruct tasks
            for t in manifest.get("tasks", []):
                due = datetime.fromisoformat(t["due_date"]) if t.get("due_date") else None
                task = Task(
                    user_id=current_user.id,
                    title=t.get("title", "Untitled Task"),
                    description=t.get("description"),
                    status=t.get("status", "todo"),
                    priority=t.get("priority", "medium"),
                    due_date=due,
                )
                db.add(task)
                await db.flush()
                db.add(WorkspaceResource(workspace_id=workspace.id, resource_type="task", resource_id=task.id, added_by_id=current_user.id))

            # Reconstruct goals/milestones
            for g in manifest.get("goals", []):
                target = datetime.fromisoformat(g["target_date"]) if g.get("target_date") else None
                goal = Goal(
                    user_id=current_user.id,
                    title=g.get("title", "Untitled Goal"),
                    description=g.get("description"),
                    target_date=target,
                    status=g.get("status", "in_progress"),
                    progress=g.get("progress", 0.0),
                )
                db.add(goal)
                await db.flush()
                db.add(WorkspaceResource(workspace_id=workspace.id, resource_type="goal", resource_id=goal.id, added_by_id=current_user.id))

            # Reconstruct memories
            for m in manifest.get("memories", []):
                memory = Memory(
                    user_id=current_user.id,
                    content=m.get("content", ""),
                    category=m.get("category", "general"),
                    source="manual",
                    review_status="approved",
                    is_pinned=m.get("is_pinned", False),
                )
                db.add(memory)
                await db.flush()
                db.add(WorkspaceResource(workspace_id=workspace.id, resource_type="memory", resource_id=memory.id, added_by_id=current_user.id))

            # Reconstruct chats & messages
            for c in manifest.get("chats", []):
                chat = Chat(
                    user_id=current_user.id,
                    title=c.get("title", "Imported Chat"),
                )
                db.add(chat)
                await db.flush()
                for msg in c.get("messages", []):
                    msg_created = datetime.fromisoformat(msg["created_at"]) if msg.get("created_at") else None
                    db.add(Message(
                        chat_id=chat.id,
                        role=msg.get("role", "user"),
                        content=msg.get("content", ""),
                        citations=msg.get("citations"),
                        created_at=msg_created or datetime.now(timezone.utc),
                    ))
                db.add(WorkspaceResource(
                    workspace_id=workspace.id,
                    resource_type="chat",
                    resource_id=chat.id,
                    added_by_id=current_user.id
                ))

            # Reconstruct documents
            settings.upload_path.mkdir(parents=True, exist_ok=True)
            for d in manifest.get("documents", []):
                arc_path = d.get("archive_path")
                # Handle both documents/ and files/ folders in archives
                if not arc_path or arc_path not in zip_file.namelist():
                    possible_alt = f"documents/{d.get('title')}"
                    if possible_alt in zip_file.namelist():
                        arc_path = possible_alt

                safe_doc_title = "".join(c for c in d.get("title", "doc") if c.isalnum() or c in (".", "-", "_")).strip()
                new_filename = f"{uuid.uuid4().hex}_{safe_doc_title}"
                dest_path = settings.upload_path / "documents" / new_filename
                dest_path.parent.mkdir(parents=True, exist_ok=True)

                if arc_path and arc_path in zip_file.namelist():
                    dest_path.write_bytes(zip_file.read(arc_path))
                else:
                    dest_path.write_text(f"Imported content for {d.get('title')}", encoding="utf-8")

                doc = Document(
                    user_id=current_user.id,
                    title=d.get("title", "Imported Document"),
                    file_path=str(dest_path),
                    file_type=d.get("file_type", "pdf"),
                    file_size=dest_path.stat().st_size if dest_path.exists() else 0,
                    status="completed",
                    summary=d.get("summary"),
                    page_count=d.get("page_count", 1),
                    word_count=d.get("word_count", 0),
                )
                db.add(doc)
                await db.flush()
                db.add(WorkspaceResource(workspace_id=workspace.id, resource_type="document", resource_id=doc.id, added_by_id=current_user.id))

            await db.commit()
            return await _workspace_read(db, workspace, current_user)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded file is not a valid zip archive")


@router.post("/{workspace_id}/generate-pdf")
async def generate_workspace_pdf(
    workspace_id: str,
    payload: WorkspaceGeneratePdfRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Generate a clean, styled on-demand PDF dossier from workspace contents or AI synthesis."""
    await _member_or_error(db, workspace_id, current_user.id)
    workspace = await _workspace_or_404(db, workspace_id)

    # 1. Gather targeted resources
    q = select(WorkspaceResource).where(WorkspaceResource.workspace_id == workspace_id)
    if payload.resource_ids:
        q = q.where(WorkspaceResource.resource_id.in_(payload.resource_ids))
    workspace_resources = list((await db.scalars(q)).all())

    by_type: dict[str, list[str]] = {}
    for r in workspace_resources:
        by_type.setdefault(r.resource_type, []).append(r.resource_id)

    # Load actual models
    chats: list[Chat] = []
    if "chat" in by_type:
        chats = list(
            (
                await db.scalars(
                    select(Chat)
                    .where(Chat.id.in_(by_type["chat"]))
                    .options(selectinload(Chat.messages))
                )
            ).all()
        )

    tasks: list[Task] = []
    if "task" in by_type:
        tasks = list(
            (
                await db.scalars(
                    select(Task)
                    .where(Task.id.in_(by_type["task"]))
                    .order_by(Task.due_date.asc().nullslast())
                )
            ).all()
        )

    goals: list[Goal] = []
    if "goal" in by_type:
        goals = list(
            (
                await db.scalars(
                    select(Goal)
                    .where(Goal.id.in_(by_type["goal"]))
                    .order_by(Goal.target_date.asc().nullslast())
                )
            ).all()
        )

    documents: list[Document] = []
    if "document" in by_type:
        documents = list(
            (
                await db.scalars(
                    select(Document).where(Document.id.in_(by_type["document"]))
                )
            ).all()
        )

    memories: list[Memory] = []
    if "memory" in by_type:
        memories = list(
            (
                await db.scalars(
                    select(Memory).where(Memory.id.in_(by_type["memory"]))
                )
            ).all()
        )

    total_items = len(chats) + len(tasks) + len(goals) + len(documents) + len(memories)
    if total_items == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No resources selected or found in this workspace to generate a PDF.",
        )

    doc_title = payload.title.strip() or f"{workspace.name} Dossier"
    doc_subtitle = payload.subtitle.strip() if payload.subtitle else f"Compiled on {datetime.now(timezone.utc).strftime('%B %d, %Y')}"
    timestamp_str = datetime.now(timezone.utc).strftime("%b %d, %Y • %I:%M %p UTC")

    # 2. If mode == "summary", synthesize using ProviderManager or structured synthesis
    synthesis_html = ""
    if payload.mode == "summary":
        user_settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == current_user.id))
        key = user_settings.ai_api_key if user_settings and user_settings.ai_api_key else None
        provider = user_settings.ai_provider if user_settings else "gemini"
        model = user_settings.ai_model if user_settings else "gemini-2.5-flash"
        temp = float(user_settings.ai_temperature) if user_settings and user_settings.ai_temperature else 0.7

        # Assemble text context
        ctx_lines = [f"WORKSPACE: {workspace.name}"]
        if documents:
            ctx_lines.append("\n--- DOCUMENTS ---")
            for d in documents:
                ctx_lines.append(f"- {d.title} (Type: {d.file_type}, Pages: {d.page_count or 1}): {d.summary or 'No summary recorded.'}")
        if tasks:
            ctx_lines.append("\n--- TASKS ---")
            for t in tasks:
                ctx_lines.append(f"- [{t.status.upper()}] {t.title} (Priority: {t.priority}, Due: {t.due_date or 'None'}): {t.description or 'No details.'}")
        if goals:
            ctx_lines.append("\n--- MILESTONES & GOALS ---")
            for g in goals:
                goal_prog = round((g.progress or 0.0) * 100)
                ctx_lines.append(f"- {g.title} (Target: {g.target_date or 'None'}, Progress: {goal_prog}%): {g.description or 'No details.'}")
        if memories:
            ctx_lines.append("\n--- NOTES & INSIGHTS ---")
            for m in memories:
                ctx_lines.append(f"- [{m.category}] {m.content}")
        if chats:
            ctx_lines.append("\n--- CHATS & DISCUSSIONS ---")
            for c in chats:
                ctx_lines.append(f"\nTopic: {c.title}")
                for msg in c.messages[:12]:
                    ctx_lines.append(f"  {msg.role.capitalize()}: {msg.content[:400]}")

        compiled_context = "\n".join(ctx_lines)

        if key:
            prompt_instruction = (
                "You are an academic synthesis expert and study guide creator. Produce an executive synthesis "
                "dossier of the provided workspace materials. Structure the response with clear, professional sections: "
                "1. Executive Overview, 2. Key Concepts & Academic Takeaways, 3. Critical Milestones & Deadlines, "
                "4. High-Yield Questions & Answers from Discussions, 5. Actionable Next Steps. "
                "Format ONLY with clean HTML tags (<h2>, <h3>, <p>, <ul>, <li>, <blockquote>, <table>, <tr>, <th>, <td>, <strong>, <em>). "
                "Do NOT use markdown backticks, code fences (```), or raw <html>/<head>/<body> wrappers."
            )
            user_msg = (
                f"Custom Goal/Focus: {payload.custom_prompt or 'Create a comprehensive study guide and executive project dossier.'}\n\n"
                f"{compiled_context}"
            )
            try:
                manager = ProviderManager(ProviderConfig(provider=provider, api_key=key, model=model, temperature=temp))
                raw_response = await manager.complete_text([
                    {"role": "system", "content": prompt_instruction},
                    {"role": "user", "content": user_msg},
                ])
                clean_html = raw_response.strip()
                if clean_html.startswith("```html"):
                    clean_html = clean_html[7:]
                elif clean_html.startswith("```"):
                    clean_html = clean_html[3:]
                if clean_html.endswith("```"):
                    clean_html = clean_html[:-3]
                synthesis_html = clean_html.strip()
            except Exception as e:
                synthesis_html = f"<div class='callout-warning'><strong>AI Provider Notice:</strong> Could not complete generative AI synthesis ({html.escape(str(e)[:180])}). Providing structured workspace overview below.</div>"

        if not synthesis_html or "<div class='callout-warning'>" in synthesis_html:
            structured_summary_parts = [
                "<h2>Executive Synthesis &amp; Overview</h2>",
                f"<p>This dossier synthesizes <strong>{total_items}</strong> academic assets across workspace <em>{html.escape(workspace.name)}</em>, including {len(documents)} document(s), {len(chats)} consultation chat(s), {len(tasks)} task(s), and {len(goals)} milestone(s).</p>",
            ]
            if not key:
                structured_summary_parts.append(
                    "<div class='callout-info'><strong>Notice:</strong> Add your AI API key in <em>Settings &rarr; BYOK</em> to generate custom generative LLM study guides and deep dives.</div>"
                )
            if documents:
                structured_summary_parts.append("<h3>Document Knowledge Assets</h3><ul>")
                for d in documents:
                    doc_sum = html.escape(d.summary or 'Attached to workspace context.')
                    structured_summary_parts.append(f"<li><strong>{html.escape(d.title)}</strong> ({html.escape(d.file_type or 'file')}, {d.page_count or 1} pages): {doc_sum}</li>")
                structured_summary_parts.append("</ul>")
            if tasks or goals:
                structured_summary_parts.append("<h3>Roadmap &amp; Action Items</h3><ul>")
                for g in goals:
                    goal_prog = round((g.progress or 0.0) * 100)
                    structured_summary_parts.append(f"<li><strong>Milestone: {html.escape(g.title)}</strong> &bull; {goal_prog}% completed (Target: {html.escape(str(g.target_date or 'Open'))})</li>")
                for t in tasks:
                    structured_summary_parts.append(f"<li><strong>Task: {html.escape(t.title)}</strong> &bull; Status: {html.escape(t.status)} (Priority: {html.escape(t.priority)})</li>")
                structured_summary_parts.append("</ul>")
            if chats:
                structured_summary_parts.append("<h3>Key Consultation Topics</h3><ul>")
                for c in chats:
                    structured_summary_parts.append(f"<li><strong>{html.escape(c.title)}</strong>: {len(c.messages)} messages logged</li>")
                structured_summary_parts.append("</ul>")
            synthesis_html += "".join(structured_summary_parts)

    # 3. Build Verbatim Sections
    verbatim_sections: list[str] = []

    # Tasks Section
    if tasks:
        task_rows = []
        for t in tasks:
            status_class = "meta-tag-blue" if t.status == "in_progress" else ("meta-tag-green" if t.status == "completed" else "meta-tag")
            due_str = t.due_date.strftime("%b %d, %Y") if t.due_date else "No due date"
            desc_html = f"<div style='margin-top: 4px; color: #475569;'>{html.escape(t.description)}</div>" if t.description else ""
            task_rows.append(
                f"<tr>"
                f"<td><strong>{html.escape(t.title)}</strong>{desc_html}</td>"
                f"<td><span class='meta-tag {status_class}'>{html.escape(t.status.replace('_', ' ').title())}</span></td>"
                f"<td><span class='meta-tag'>{html.escape(t.priority.upper())}</span></td>"
                f"<td>{html.escape(due_str)}</td>"
                f"</tr>"
            )
        verbatim_sections.append(
            f"<h2>Tasks &amp; Action Items ({len(tasks)})</h2>"
            f"<table><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Due Date</th></tr></thead>"
            f"<tbody>{''.join(task_rows)}</tbody></table>"
        )

    # Milestones Section
    if goals:
        goal_cards = []
        for g in goals:
            target_str = g.target_date.strftime("%b %d, %Y") if g.target_date else "Flexible target"
            desc = html.escape(g.description) if g.description else "No milestone description."
            goal_prog = round((g.progress or 0.0) * 100)
            goal_cards.append(
                f"<div class='item-card'>"
                f"<div style='margin-bottom: 4px; font-weight: bold; font-size: 10.5pt; color: #0f172a;'>{html.escape(g.title)} "
                f"<span class='meta-tag meta-tag-amber'>{goal_prog}% Progress</span></div>"
                f"<div style='font-size: 8.5pt; color: #64748b; margin-bottom: 6px;'>Target Date: {html.escape(target_str)}</div>"
                f"<div style='font-size: 9pt; color: #334155;'>{desc}</div>"
                f"</div>"
            )
        verbatim_sections.append(
            f"<h2>Project Milestones ({len(goals)})</h2>{''.join(goal_cards)}"
        )

    # Documents Section
    if documents:
        doc_rows = []
        for d in documents:
            summary_txt = html.escape(d.summary) if d.summary else "Indexed document content."
            doc_rows.append(
                f"<tr>"
                f"<td><strong>{html.escape(d.title)}</strong></td>"
                f"<td><span class='meta-tag'>{html.escape((d.file_type or 'pdf').upper())}</span></td>"
                f"<td>{d.page_count or 1} pages</td>"
                f"<td style='color: #475569;'>{summary_txt}</td>"
                f"</tr>"
            )
        verbatim_sections.append(
            f"<h2>Document Knowledge Catalog ({len(documents)})</h2>"
            f"<table><thead><tr><th>Document</th><th>Format</th><th>Pages</th><th>Summary / Notes</th></tr></thead>"
            f"<tbody>{''.join(doc_rows)}</tbody></table>"
        )

    # Memories / Notes Section
    if memories:
        mem_items = []
        for m in memories:
            mem_items.append(
                f"<li style='margin-bottom: 6px;'>"
                f"<span class='meta-tag'>{html.escape(m.category.title())}</span> "
                f"{html.escape(m.content)}"
                f"</li>"
            )
        verbatim_sections.append(
            f"<h2>Key Insights &amp; Pinned Notes ({len(memories)})</h2>"
            f"<ul>{''.join(mem_items)}</ul>"
        )

    # Chat Transcripts Section
    if chats:
        chat_blocks = []
        for c in chats:
            msg_bubbles = []
            for m in c.messages:
                is_user = m.role == "user"
                role_label = "Student" if is_user else "LoopBack AI"
                role_class = "author-user" if is_user else "author-ai"
                bubble_class = "chat-bubble-user" if is_user else "chat-bubble-ai"

                safe_content = html.escape(m.content).replace("\n", "<br>")
                created_str = m.created_at.strftime("%b %d, %H:%M") if m.created_at else ""

                msg_bubbles.append(
                    f"<div class='{bubble_class}'>"
                    f"<div style='margin-bottom: 4px; font-size: 8pt;'>"
                    f"<span class='author-label {role_class}'>{role_label}</span> &bull; "
                    f"<span style='color: #94a3b8;'>{created_str}</span>"
                    f"</div>"
                    f"<div style='font-size: 9pt; color: #1e293b;'>{safe_content}</div>"
                    f"</div>"
                )

            chat_content = "".join(msg_bubbles) if msg_bubbles else "<p style='color:#94a3b8; font-style:italic;'>No messages recorded in this chat.</p>"
            chat_blocks.append(
                f"<div style='margin-top: 14px; margin-bottom: 20px;'>"
                f"<h3 style='border-left: 3px solid #6366f1; padding-left: 8px;'>Consultation: {html.escape(c.title)} ({len(c.messages)} messages)</h3>"
                f"{chat_content}"
                f"</div>"
            )
        verbatim_sections.append(
            f"<h2>Consultation Chat Transcripts ({len(chats)})</h2>{''.join(chat_blocks)}"
        )

    # 4. Assemble Full HTML Document
    html_doc = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    body {{
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 10pt;
        color: #1e293b;
        line-height: 1.5;
        margin: 0;
        padding: 0;
    }}
    .header-card {{
        border-bottom: 2px solid #0f172a;
        padding-bottom: 12px;
        margin-bottom: 20px;
    }}
    .workspace-badge {{
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        font-weight: 700;
        color: #475569;
        margin-bottom: 4px;
    }}
    h1 {{
        font-size: 20pt;
        color: #0f172a;
        margin-top: 2px;
        margin-bottom: 4px;
        font-weight: 700;
        letter-spacing: -0.5px;
    }}
    .subtitle {{
        font-size: 10.5pt;
        color: #64748b;
        margin-bottom: 12px;
    }}
    .meta-bar {{
        font-size: 8.5pt;
        color: #94a3b8;
    }}
    h2 {{
        font-size: 13pt;
        color: #0f172a;
        margin-top: 22px;
        margin-bottom: 10px;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4px;
    }}
    h3 {{
        font-size: 10.5pt;
        color: #1e293b;
        margin-top: 14px;
        margin-bottom: 6px;
    }}
    p {{
        margin-top: 0;
        margin-bottom: 8px;
    }}
    table {{
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        margin-bottom: 16px;
        font-size: 8.5pt;
    }}
    th {{
        background-color: #f8fafc;
        color: #334155;
        font-weight: 600;
        text-align: left;
        padding: 7px 10px;
        border: 1px solid #e2e8f0;
    }}
    td {{
        padding: 7px 10px;
        border: 1px solid #e2e8f0;
        color: #1e293b;
        vertical-align: top;
    }}
    .meta-tag {{
        display: inline-block;
        background-color: #f1f5f9;
        color: #475569;
        font-size: 7.5pt;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}
    .meta-tag-blue {{
        background-color: #eff6ff;
        color: #1d4ed8;
    }}
    .meta-tag-green {{
        background-color: #f0fdf4;
        color: #15803d;
    }}
    .meta-tag-amber {{
        background-color: #fffbeb;
        color: #b45309;
    }}
    .item-card {{
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 10px 12px;
        margin-bottom: 10px;
    }}
    .chat-bubble-user {{
        background-color: #f1f5f9;
        border-left: 3px solid #3b82f6;
        padding: 8px 12px;
        margin-bottom: 8px;
        border-radius: 0 4px 4px 0;
    }}
    .chat-bubble-ai {{
        background-color: #faf5ff;
        border-left: 3px solid #8b5cf6;
        padding: 8px 12px;
        margin-bottom: 10px;
        border-radius: 0 4px 4px 0;
    }}
    .author-label {{
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}
    .author-user {{
        color: #2563eb;
    }}
    .author-ai {{
        color: #7c3aed;
    }}
    .callout-info {{
        background-color: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
        padding: 8px 12px;
        border-radius: 4px;
        margin-bottom: 12px;
        font-size: 8.5pt;
    }}
    .callout-warning {{
        background-color: #fffbeb;
        border: 1px solid #fde68a;
        color: #92400e;
        padding: 8px 12px;
        border-radius: 4px;
        margin-bottom: 12px;
        font-size: 8.5pt;
    }}
</style>
</head>
<body>
    <div class="header-card">
        <div class="workspace-badge">LoopBack &bull; Workspace Dossier &bull; {html.escape(workspace.name)}</div>
        <h1>{html.escape(doc_title)}</h1>
        <div class="subtitle">{html.escape(doc_subtitle)}</div>
        <div class="meta-bar">Generated for {html.escape(current_user.full_name or current_user.email)} &bull; {timestamp_str}</div>
    </div>
    {synthesis_html if payload.mode == "summary" else ""}
    {''.join(verbatim_sections) if (payload.mode == "verbatim" or not synthesis_html) else ""}
</body>
</html>
"""

    # 5. Render with PyMuPDF fitz.Story and DocumentWriter
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    os.close(tmp_fd)

    try:
        writer = fitz.DocumentWriter(tmp_path)
        story = fitz.Story(html=html_doc)
        page_rect = fitz.Rect(0, 0, 595, 842) # A4
        content_rect = fitz.Rect(40, 48, 555, 794)

        more = 1
        page_count = 0
        while more and page_count < 250:
            dev = writer.begin_page(page_rect)
            more, _ = story.place(content_rect)
            story.draw(dev)
            writer.end_page()
            page_count += 1

        writer.close()
        del writer

        with open(tmp_path, "rb") as f:
            pdf_bytes = f.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compile PDF document: {str(exc)}",
        ) from exc
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    safe_filename = "".join(c for c in doc_title if c.isalnum() or c in ("-", "_", " ")).strip().replace(" ", "_") or "workspace_dossier"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}.pdf"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
