"""Models package – import all models here so Alembic can discover them."""

from app.models.chat import Chat, Message
from app.models.document import Document, DocumentChunk
from app.models.goal import Goal
from app.models.memory import Memory
from app.models.notification import Notification
from app.models.settings import UserSettings
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceInvitation, WorkspaceMember, WorkspaceResource
from app.models.learning import LearningSession

__all__ = [
    "User",
    "Chat",
    "Message",
    "Document",
    "DocumentChunk",
    "Task",
    "Goal",
    "Memory",
    "Notification",
    "Workspace",
    "WorkspaceMember",
    "WorkspaceInvitation",
    "WorkspaceResource",
    "UserSettings",
    "LearningSession",
]
