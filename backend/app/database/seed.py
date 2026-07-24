"""Seed script – populate the database with demo data."""

import asyncio
from datetime import datetime, timedelta, timezone

from app.core.security import hash_password
from app.database.base import Base
from app.database.session import async_session_factory, engine
from app.models import (
    Chat,
    Document,
    Goal,
    Memory,
    Message,
    Notification,
    Task,
    User,
    UserSettings,
    Workspace,
    WorkspaceMember,
)


async def seed() -> None:
    """Create demo data."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as db:
        # ── Demo User ──────────────────────────────────────────
        user = User(
            id="demo-user-001",
            email="demo@loopback.ai",
            hashed_password=hash_password("password123"),
            full_name="Alex Chen",
            bio="Product designer & developer. Building things that matter.",
            is_active=True,
            is_verified=True,
        )
        db.add(user)

        settings = UserSettings(user_id=user.id)
        db.add(settings)

        # ── Chats ──────────────────────────────────────────────
        now = datetime.now(timezone.utc)

        chat1 = Chat(
            id="chat-001",
            user_id=user.id,
            title="Project Architecture",
            created_at=now - timedelta(hours=2),
        )
        db.add(chat1)
        db.add(Message(
            chat_id=chat1.id,
            role="user",
            content="Help me design the architecture for a microservices-based e-commerce platform.",
        ))
        db.add(Message(
            chat_id=chat1.id,
            role="assistant",
            content="I'd recommend a domain-driven design approach with the following bounded contexts:\n\n1. **Catalog Service** – Product management, search, categories\n2. **Order Service** – Order lifecycle, cart management\n3. **Payment Service** – Payment processing, refunds\n4. **User Service** – Authentication, profiles\n5. **Notification Service** – Email, push notifications\n\nEach service should have its own database and communicate via an event bus.",
        ))

        chat2 = Chat(
            id="chat-002",
            user_id=user.id,
            title="Code Review Help",
            created_at=now - timedelta(hours=5),
        )
        db.add(chat2)

        chat3 = Chat(
            id="chat-003",
            user_id=user.id,
            title="Learning TypeScript Generics",
            created_at=now - timedelta(days=1),
        )
        db.add(chat3)

        # ── Tasks ──────────────────────────────────────────────
        tasks = [
            Task(
                user_id=user.id, title="Design login page", status="done",
                priority="high", position=0,
                completed_at=now - timedelta(days=1),
            ),
            Task(
                user_id=user.id, title="Implement JWT auth", status="done",
                priority="high", position=1,
                completed_at=now - timedelta(hours=12),
            ),
            Task(
                user_id=user.id, title="Build dashboard layout", status="in_progress",
                priority="high", position=0,
            ),
            Task(
                user_id=user.id, title="Set up CI/CD pipeline", status="in_progress",
                priority="medium", position=1,
            ),
            Task(
                user_id=user.id, title="Write API documentation", status="todo",
                priority="medium", position=0,
                due_date=now + timedelta(days=3),
            ),
            Task(
                user_id=user.id, title="Add unit tests for auth", status="todo",
                priority="high", position=1,
                due_date=now + timedelta(days=2),
            ),
            Task(
                user_id=user.id, title="Performance optimization", status="todo",
                priority="low", position=2,
                due_date=now + timedelta(days=7),
            ),
            Task(
                user_id=user.id, title="Review PR #42", status="review",
                priority="medium", position=0,
            ),
        ]
        db.add_all(tasks)

        # ── Goals ──────────────────────────────────────────────
        goals = [
            Goal(
                user_id=user.id, title="Complete MVP", category="monthly",
                status="active", progress=0.45,
                target_date=now + timedelta(days=25),
            ),
            Goal(
                user_id=user.id, title="Read 2 chapters", category="daily",
                status="active", progress=0.5,
                target_value=2, current_value=1, unit="chapters",
            ),
            Goal(
                user_id=user.id, title="Ship 5 features this week", category="weekly",
                status="active", progress=0.6,
                target_value=5, current_value=3, unit="features",
            ),
            Goal(
                user_id=user.id, title="Launch beta", category="long_term",
                status="active", progress=0.2,
                target_date=now + timedelta(days=90),
            ),
        ]
        db.add_all(goals)

        # ── Memories ───────────────────────────────────────────
        memories = [
            Memory(
                user_id=user.id,
                content="User prefers TypeScript strict mode and functional programming patterns.",
                category="preference",
                source="auto",
                is_pinned=True,
            ),
            Memory(
                user_id=user.id,
                content="Working on an e-commerce platform using microservices architecture.",
                category="fact",
                source="auto",
            ),
            Memory(
                user_id=user.id,
                content="Prefers dark mode for coding. Uses VS Code with Catppuccin theme.",
                category="preference",
                source="auto",
            ),
        ]
        db.add_all(memories)

        # ── Notifications ──────────────────────────────────────
        notifications = [
            Notification(
                user_id=user.id,
                title="Task Due Soon",
                message="'Write API documentation' is due in 3 days",
                type="task_reminder",
            ),
            Notification(
                user_id=user.id,
                title="AI Insight",
                message="You've been most productive between 9-11 AM this week",
                type="ai_suggestion",
            ),
            Notification(
                user_id=user.id,
                title="Document Ready",
                message="'Architecture.pdf' has been processed and indexed",
                type="doc_processed",
                is_read=True,
            ),
        ]
        db.add_all(notifications)

        # ── Workspace ──────────────────────────────────────────
        workspace = Workspace(
            id="ws-001",
            name="LoopBack Team",
            description="Core product development team",
            owner_id=user.id,
        )
        db.add(workspace)
        db.add(WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role="owner",
        ))

        await db.commit()
        print("✓ Database seeded successfully with demo data!")


if __name__ == "__main__":
    asyncio.run(seed())
