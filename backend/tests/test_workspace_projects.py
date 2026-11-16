"""Tests for Workspace Projects (ChatGPT Projects / Gemini Gems behavior) and Scoped RAG."""

from __future__ import annotations

import json
from types import SimpleNamespace
from datetime import datetime, timezone
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Chat, Message
from app.models.document import Document, DocumentChunk
from app.models.memory import Memory
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceResource
from app.schemas.chat import ChatCreate, ChatUpdate
from app.schemas.document import DocumentSearchResult, DocumentUpdate
from app.schemas.memory import MemoryCreate, MemoryUpdate
from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate
from app.services import chat_service, document_service, memory_service
from app.services.workspace_context_service import build_workspace_context, WorkspaceContext


def test_workspace_project_schemas() -> None:
    """Workspace schemas correctly handle custom_instructions / persona."""
    create = WorkspaceCreate(
        name="Physics 101",
        description="Classical mechanics and thermodynamics",
        custom_instructions="Act as a patient physics professor. Always cite SI units.",
    )
    assert create.custom_instructions == "Act as a patient physics professor. Always cite SI units."

    update = WorkspaceUpdate(
        custom_instructions="Updated persona instructions.",
    )
    assert update.custom_instructions == "Updated persona instructions."


def test_chat_and_document_and_memory_schemas() -> None:
    """Chat, Document, and Memory schemas accept workspace_id."""
    chat_create = ChatCreate(title="HW 1 Discussion", workspace_id="ws-physics")
    assert chat_create.workspace_id == "ws-physics"

    chat_update = ChatUpdate(workspace_id="ws-math")
    assert chat_update.workspace_id == "ws-math"

    doc_update = DocumentUpdate(workspace_id="ws-physics")
    assert doc_update.workspace_id == "ws-physics"

    mem_create = MemoryCreate(content="Student prefers step-by-step calculus", workspace_id="ws-math")
    assert mem_create.workspace_id == "ws-math"

    mem_global = MemoryCreate(content="Student name is Alice", workspace_id=None)
    assert mem_global.workspace_id is None


def test_document_search_scoped_by_allowed_ids() -> None:
    """Document search post-filters candidates strictly to allowed_document_ids."""
    matches = [
        DocumentSearchResult(
            document_id="doc-math-1", document_title="Calculus Notes", chunk_content="Derivatives of sin(x)",
            chunk_index=0, relevance_score=0.95
        ),
        DocumentSearchResult(
            document_id="doc-physics-1", document_title="Mechanics Notes", chunk_content="Newton second law",
            chunk_index=0, relevance_score=0.92
        ),
    ]

    # If allowed_document_ids is ['doc-math-1'], doc-physics-1 is excluded
    allowed = ["doc-math-1"]
    filtered = [m for m in matches if m.document_id in allowed]
    assert len(filtered) == 1
    assert filtered[0].document_id == "doc-math-1"

    # If allowed_document_ids is empty list, no documents allowed
    allowed_empty: list[str] = []
    filtered_empty = [m for m in matches if m.document_id in allowed_empty]
    assert len(filtered_empty) == 0


@pytest.mark.asyncio
async def test_search_user_documents_empty_allowed_ids_returns_immediately() -> None:
    """When a workspace has zero documents, search_user_documents returns empty list without queries."""
    class FakeDb:
        pass

    res = await document_service.search_user_documents(
        FakeDb(), "user-1", "calculus formula", allowed_document_ids=[]
    )
    assert res == []


@pytest.mark.asyncio
async def test_chat_context_incorporates_workspace_persona(monkeypatch: pytest.MonkeyPatch) -> None:
    """When a chat has a workspace, its custom instructions and scoped document IDs are used."""
    ws = Workspace(
        id="ws-calc",
        name="Calculus Project",
        owner_id="user-1",
        custom_instructions="You are an expert Math tutor. Guide the student step by step with proofs.",
    )
    chat = Chat(
        id="chat-1",
        user_id="user-1",
        title="Integration by parts",
        workspace_id=ws.id,
    )
    messages = [
        Message(id="m1", chat_id="chat-1", role="user", content="How do I integrate x*e^x?"),
    ]

    class FakeScalars:
        def __init__(self, items: list[object]) -> None:
            self.items = items
        def all(self) -> list[object]:
            return self.items

    class FakeDb:
        def __init__(self) -> None:
            self.added: list[object] = []

        async def get(self, model: type, ident: str) -> object | None:
            if model is Workspace and ident == ws.id:
                return ws
            if model is Chat and ident == chat.id:
                return chat
            return None

        async def scalar(self, query: object) -> object | None:
            return None

        async def scalars(self, query: object) -> FakeScalars:
            if "message" in str(query).lower():
                return FakeScalars(messages)
            return FakeScalars([])

        async def execute(self, query: object) -> object:
            return SimpleNamespace(scalar_one_or_none=lambda: chat, scalars=lambda: FakeScalars(messages))

        def add(self, obj: object) -> None:
            self.added.append(obj)

        async def commit(self) -> None:
            pass

        async def refresh(self, obj: object) -> None:
            pass

    async def fake_get_chat(db, user_id, chat_id):
        return chat

    search_called_with: dict[str, object] = {}
    async def fake_search_docs(db, user_id, query, limit=5, allowed_document_ids=None):
        search_called_with["allowed_document_ids"] = allowed_document_ids
        return []

    ws_context_called_with: dict[str, object] = {}
    async def fake_build_ws_context(db, user_id, query, workspace_id=None):
        ws_context_called_with["workspace_id"] = workspace_id
        return WorkspaceContext(content="", item_count=0)

    class FakeProvider:
        async def stream_text(self, messages):
            # Assert prompt_messages contains workspace persona instructions
            persona_found = any(
                "Workspace Guidelines & Persona (Calculus Project)" in m.content
                and "expert Math tutor" in m.content
                for m in messages
            )
            assert persona_found, f"Persona not found in prompt messages: {messages}"
            yield "Use integration by parts: u=x, dv=e^x dx."

    async def no_extraction(**kw):
        pass

    monkeypatch.setattr(chat_service, "get_chat_with_messages", fake_get_chat)
    monkeypatch.setattr(chat_service, "search_user_documents", fake_search_docs)
    monkeypatch.setattr(chat_service, "build_workspace_context", fake_build_ws_context)
    monkeypatch.setattr(chat_service, "get_ai_provider", lambda: FakeProvider())
    monkeypatch.setattr(chat_service, "extract_memories_from_turn", no_extraction)

    db = FakeDb()
    generator = await chat_service.stream_chat_response(
        db, "user-1", "chat-1", "How do I integrate x*e^x?", retry=True
    )
    events = [json.loads(event.split("data: ", 1)[1]) for event in [item async for item in generator]]

    assert ws_context_called_with.get("workspace_id") == "ws-calc"
    assert search_called_with.get("allowed_document_ids") == []
    assert events[1] == {"content": "Use integration by parts: u=x, dv=e^x dx."}


@pytest.mark.asyncio
async def test_memory_service_extract_with_workspace_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """extract_memories_from_turn saves workspace_id when passed."""
    saved_memories: list[Memory] = []
    saved_resources: list[WorkspaceResource] = []

    class FakeScalars:
        def __init__(self, items: list[object]) -> None:
            self.items = items
        def all(self) -> list[object]:
            return self.items

    class FakeSession:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def scalar(self, query):
            return None
        async def scalars(self, query):
            return FakeScalars([])
        def add(self, obj):
            if isinstance(obj, Memory):
                saved_memories.append(obj)
            elif isinstance(obj, WorkspaceResource):
                saved_resources.append(obj)
        async def flush(self):
            for m in saved_memories:
                if not getattr(m, "id", None):
                    m.id = "mem-generated-1"
        async def commit(self):
            pass

    monkeypatch.setattr(memory_service.settings, "gemini_api_key", "test-key-1234567890")
    async def fake_enabled(db, uid):
        return True
    monkeypatch.setattr(memory_service, "memory_intelligence_enabled", fake_enabled)
    monkeypatch.setattr(memory_service, "async_session_factory", lambda: FakeSession())

    class FakeAIProvider:
        async def complete_text(self, messages):
            return '{"memories": [{"content": "User is studying limits and continuity", "category": "project_information", "confidence": 0.95}]}'

    async def fake_ai_embeddings(texts, **kw):
        return None

    monkeypatch.setattr(memory_service, "get_ai_provider", lambda: FakeAIProvider())
    monkeypatch.setattr(memory_service, "_ai_embeddings", fake_ai_embeddings)
    monkeypatch.setattr(memory_service, "_collection", lambda: None)

    await memory_service.extract_memories_from_turn(
        user_id="user-1",
        chat_id="chat-1",
        source_message_id="msg-1",
        user_content="I am working on limits and continuity.",
        assistant_content="Understood!",
        workspace_id="ws-calc-101",
    )

    assert len(saved_memories) == 1
    assert saved_memories[0].content == "User is studying limits and continuity"
    assert saved_memories[0].workspace_id == "ws-calc-101"
    assert len(saved_resources) == 1
    assert saved_resources[0].workspace_id == "ws-calc-101"
    assert saved_resources[0].resource_type == "memory"


@pytest.mark.asyncio
async def test_chat_service_create_chat_with_workspace_id() -> None:
    """create_chat stores workspace_id and creates WorkspaceResource."""
    added_items: list[object] = []

    class FakeDb:
        def add(self, obj: object) -> None:
            added_items.append(obj)
            if hasattr(obj, "id") and not getattr(obj, "id", None):
                obj.id = "chat-new-123"

        async def commit(self) -> None:
            pass

        async def refresh(self, obj: object) -> None:
            pass

    db = FakeDb()
    chat = await chat_service.create_chat(db, "user-1", "Calculus Questions", workspace_id="ws-math")
    assert chat.title == "Calculus Questions"
    assert chat.workspace_id == "ws-math"
    assert len(added_items) == 2
    resource = [item for item in added_items if isinstance(item, WorkspaceResource)][0]
    assert resource.workspace_id == "ws-math"
    assert resource.resource_type == "chat"


@pytest.mark.asyncio
async def test_memory_api_filtering_global_vs_workspace() -> None:
    """list_memories correctly filters between global and workspace-scoped memories."""
    from app.api.memory import list_memories
    from app.models.user import User

    current_user = User(id="user-1", email="student@test.com")
    mem_global = Memory(id="m-global", user_id="user-1", content="Prefers dark mode", workspace_id=None)
    mem_math = Memory(id="m-math", user_id="user-1", content="Struggling with linear algebra", workspace_id="ws-math")
    mem_physics = Memory(id="m-physics", user_id="user-1", content="Working on lab report", workspace_id="ws-phys")
    all_memories = [mem_global, mem_math, mem_physics]

    class FakeResult:
        def __init__(self, items):
            self._items = items
        def scalars(self):
            return self
        def all(self):
            return self._items

    class FakeDb:
        async def execute(self, query):
            # Inspect SQL criteria
            query_str = str(query).lower()
            if "is null" in query_str:
                return FakeResult([mem_global])
            if "workspace_id = 'ws-math'" in query_str or "workspace_id = :workspace_id_1" in query_str:
                return FakeResult([mem_math])
            return FakeResult(all_memories)

    db = FakeDb()
    # Global scope
    global_res = await list_memories(scope="global", current_user=current_user, db=db)
    assert len(global_res) == 1
    assert global_res[0].id == "m-global"

    # Workspace scope
    math_res = await list_memories(workspace_id="ws-math", current_user=current_user, db=db)
    assert len(math_res) == 1
    assert math_res[0].id == "m-math"

    # All scope
    all_res = await list_memories(current_user=current_user, db=db)
    assert len(all_res) == 3
