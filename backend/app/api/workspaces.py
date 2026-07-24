"""Workspace switching, invitations, roles, and explicit resource sharing."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.chat import Chat
from app.models.document import Document
from app.models.goal import Goal
from app.models.memory import Memory
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceInvitation, WorkspaceMember, WorkspaceResource
from app.schemas.workspace import (
    ActiveWorkspaceUpdate,
    WorkspaceCreate,
    WorkspaceInvitationRead,
    WorkspaceMemberAdd,
    WorkspaceMemberRead,
    WorkspaceMemberUpdate,
    WorkspaceRead,
    WorkspaceAvailableResource,
    WorkspaceResourceCreate,
    WorkspaceResourceRead,
    WorkspaceUpdate,
)
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
    model = RESOURCE_MODELS[resource.resource_type]
    item = await db.get(model, resource.resource_id)
    if item is None:
        return "Unavailable resource", "The source resource was deleted"
    if resource.resource_type == "document":
        return item.title, f"{item.file_type.upper()} document"
    if resource.resource_type == "memory":
        return item.content[:120], item.category
    if resource.resource_type == "chat":
        return item.title, "Chat"
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
    """List the caller's own recent resources they may explicitly share."""
    await _member_or_error(db, workspace_id, current_user.id, "editor")
    output: list[WorkspaceAvailableResource] = []
    tasks = list((await db.scalars(select(Task).where(Task.user_id == current_user.id).order_by(Task.updated_at.desc()).limit(20))).all())
    goals = list((await db.scalars(select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.updated_at.desc()).limit(20))).all())
    documents = list((await db.scalars(select(Document).where(Document.user_id == current_user.id).order_by(Document.updated_at.desc()).limit(20))).all())
    memories = list((await db.scalars(select(Memory).where(Memory.user_id == current_user.id).order_by(Memory.updated_at.desc()).limit(20))).all())
    chats = list((await db.scalars(select(Chat).where(Chat.user_id == current_user.id).order_by(Chat.updated_at.desc()).limit(20))).all())
    output.extend(WorkspaceAvailableResource(resource_type="task", resource_id=item.id, title=item.title, subtitle=item.status.replace("_", " ")) for item in tasks)
    output.extend(WorkspaceAvailableResource(resource_type="goal", resource_id=item.id, title=item.title, subtitle=f"{round(item.progress * 100)}% complete") for item in goals)
    output.extend(WorkspaceAvailableResource(resource_type="document", resource_id=item.id, title=item.title, subtitle=item.file_type.upper()) for item in documents)
    output.extend(WorkspaceAvailableResource(resource_type="memory", resource_id=item.id, title=item.content[:120], subtitle=item.category) for item in memories)
    output.extend(WorkspaceAvailableResource(resource_type="chat", resource_id=item.id, title=item.title, subtitle="Chat") for item in chats)
    return output


@router.post("/{workspace_id}/resources", response_model=WorkspaceResourceRead, status_code=status.HTTP_201_CREATED)
async def add_workspace_resource(workspace_id: str, data: WorkspaceResourceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> WorkspaceResourceRead:
    await _member_or_error(db, workspace_id, current_user.id, "editor")
    model = RESOURCE_MODELS[data.resource_type]
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


@router.delete("/{workspace_id}/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_workspace_resource(workspace_id: str, resource_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> None:
    await _member_or_error(db, workspace_id, current_user.id, "editor")
    resource = await db.scalar(select(WorkspaceResource).where(WorkspaceResource.id == resource_id, WorkspaceResource.workspace_id == workspace_id))
    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared resource not found")
    await db.delete(resource)
    await db.commit()
