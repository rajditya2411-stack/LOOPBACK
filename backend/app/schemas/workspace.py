"""Pydantic schemas for Workspace and WorkspaceMember."""

from datetime import datetime

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    """Schema for creating a new workspace."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    custom_instructions: str | None = None


class WorkspaceRead(BaseModel):
    """Schema for returning workspace data."""

    id: str
    name: str
    description: str | None = None
    custom_instructions: str | None = None
    owner_id: str
    member_count: int = 0
    resource_count: int = 0
    role: str | None = None
    is_active: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkspaceUpdate(BaseModel):
    """Schema for updating a workspace."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    custom_instructions: str | None = None


class WorkspaceMemberRead(BaseModel):
    """Schema for returning workspace member data."""

    id: str
    workspace_id: str
    user_id: str
    role: str
    joined_at: datetime
    user_name: str | None = None
    user_email: str | None = None

    model_config = {"from_attributes": True}


class WorkspaceMemberAdd(BaseModel):
    """Schema for adding a member to a workspace."""

    user_email: str
    role: str = Field(default="viewer", pattern="^(admin|editor|viewer)$")


class WorkspaceMemberUpdate(BaseModel):
    """Schema for updating a member's role."""

    role: str = Field(pattern="^(admin|editor|viewer)$")


class ActiveWorkspaceUpdate(BaseModel):
    """Select a workspace context for the current user, or return to personal space."""

    workspace_id: str | None = None


class WorkspaceInvitationRead(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str | None = None
    email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime
    accept_url: str | None = None

    model_config = {"from_attributes": True}


class WorkspaceResourceCreate(BaseModel):
    resource_type: str = Field(pattern="^(task|goal|document|memory|chat)$")
    resource_id: str


class WorkspaceResourceBatchCreate(BaseModel):
    resources: list[WorkspaceResourceCreate]


class WorkspaceResourceRead(BaseModel):
    id: str
    workspace_id: str
    resource_type: str
    resource_id: str
    title: str = ""
    subtitle: str | None = None
    added_by_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkspaceAvailableResource(BaseModel):
    resource_type: str
    resource_id: str
    title: str
    subtitle: str | None = None


class WorkspaceGeneratePdfRequest(BaseModel):
    title: str = "Workspace Dossier"
    subtitle: str | None = None
    mode: str = Field(default="verbatim", pattern="^(verbatim|summary)$")
    custom_prompt: str | None = None
    resource_ids: list[str] = []
