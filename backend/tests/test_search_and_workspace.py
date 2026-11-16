"""Tests for unified-search ranking and workspace authorization boundaries."""

import io
import json
import zipfile
from types import SimpleNamespace
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.api import search, workspaces
from app.models.chat import Chat, Message
from app.models.task import Task
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceResource
from app.schemas.workspace import WorkspaceResourceBatchCreate, WorkspaceResourceCreate
from app.services.search_ranking_service import SearchSignals, relevance_score, text_signals, with_metadata


def test_keyword_score_rewards_multiple_matching_terms() -> None:
    assert search._keyword_score("Plan a Python backend", ["python", "backend"]) == 1.0
    assert search._keyword_score("Plan a Python backend", ["python", "missing"]) == 0.5
    assert search._keyword_score("Plan a Python backend", ["missing"]) == 0.0


def test_shared_ranking_rewards_exact_titles_and_semantic_matches() -> None:
    exact = relevance_score(with_metadata(text_signals("release plan", "Release plan", "", semantic=0.0)))
    partial = relevance_score(with_metadata(text_signals("release plan", "Release notes", "planning details", semantic=0.0)))
    semantic = relevance_score(SearchSignals(semantic=0.9))

    assert exact > partial
    assert semantic > 0


@pytest.mark.asyncio
async def test_workspace_role_guard_blocks_viewer_from_editing() -> None:
    class Db:
        async def scalar(self, _query: object) -> object:
            return SimpleNamespace(role="viewer")

    member = await workspaces._member_or_error(Db(), "workspace-1", "user-1")
    assert member.role == "viewer"
    with pytest.raises(HTTPException) as error:
        await workspaces._member_or_error(Db(), "workspace-1", "user-1", "editor")
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_workspace_role_guard_blocks_non_members() -> None:
    class Db:
        async def scalar(self, _query: object) -> None:
            return None

    with pytest.raises(HTTPException) as error:
        await workspaces._member_or_error(Db(), "workspace-1", "user-1")
    assert error.value.status_code == 403


def test_workspace_batch_resource_schema() -> None:
    data = WorkspaceResourceBatchCreate(
        resources=[
            WorkspaceResourceCreate(resource_type="chat", resource_id="chat-1"),
            WorkspaceResourceCreate(resource_type="document", resource_id="doc-1"),
        ]
    )
    assert len(data.resources) == 2
    assert data.resources[0].resource_type == "chat"


@pytest.mark.asyncio
async def test_workspace_export_includes_chats_and_markdown() -> None:
    ws = Workspace(id="ws-test", name="Physics Prep", description="Midterm study scope", owner_id="user-1")
    member = WorkspaceMember(workspace_id=ws.id, user_id="user-1", role="owner")
    res_chat = WorkspaceResource(workspace_id=ws.id, resource_type="chat", resource_id="chat-1", added_by_id="user-1")
    res_task = WorkspaceResource(workspace_id=ws.id, resource_type="task", resource_id="task-1", added_by_id="user-1")

    chat = Chat(id="chat-1", user_id="user-1", title="Thermodynamics Derivation", created_at=datetime.now(timezone.utc))
    messages = [
        Message(id="m1", chat_id="chat-1", role="user", content="Explain Carnot cycle.", created_at=datetime.now(timezone.utc)),
        Message(id="m2", chat_id="chat-1", role="assistant", content="The Carnot cycle consists of 4 steps.", created_at=datetime.now(timezone.utc)),
    ]
    task = Task(id="task-1", user_id="user-1", title="Solve Problem Set 4", description="Problems 1-10", status="in_progress", priority="high")

    class MockScalars:
        def __init__(self, items: list[object]):
            self._items = items
        def all(self) -> list[object]:
            return self._items

    class MockDb:
        async def scalar(self, query: object) -> object:
            return member

        async def get(self, model: object, ident: str) -> object:
            if model == Workspace and ident == "ws-test":
                return ws
            if model == Chat and ident == "chat-1":
                return chat
            if model == Task and ident == "task-1":
                return task
            return None

        async def scalars(self, query: object) -> MockScalars:
            # Check what's being queried
            q_str = str(query)
            if "workspace_resources" in q_str:
                return MockScalars([res_chat, res_task])
            if "messages" in q_str:
                return MockScalars(messages)
            return MockScalars([])

    user = SimpleNamespace(id="user-1")
    resp = await workspaces.export_workspace_zip("ws-test", resource_ids=None, current_user=user, db=MockDb())

    assert resp.status_code == 200
    assert resp.media_type == "application/zip"
    assert "PhysicsPrep.loopback.zip" in resp.headers["Content-Disposition"]

    # Open zip and check contents
    zip_bytes = io.BytesIO(resp.body)
    with zipfile.ZipFile(zip_bytes, "r") as zf:
        namelist = zf.namelist()
        assert "manifest.json" in namelist
        assert "README.md" in namelist
        assert "tasks/tasks_overview.md" in namelist

        # Verify chat markdown transcript
        chat_files = [f for f in namelist if f.startswith("chats/")]
        assert len(chat_files) == 1
        chat_content = zf.read(chat_files[0]).decode("utf-8")
        assert "Carnot cycle" in chat_content
        assert "LoopBack AI" in chat_content

        # Verify manifest JSON
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        assert manifest["workspace"]["name"] == "Physics Prep"
        assert len(manifest["chats"]) == 1
        assert manifest["chats"][0]["title"] == "Thermodynamics Derivation"
        assert len(manifest["tasks"]) == 1
        assert manifest["tasks"][0]["title"] == "Solve Problem Set 4"


@pytest.mark.asyncio
async def test_generate_workspace_pdf_verbatim(monkeypatch):
    from app.schemas.workspace import WorkspaceGeneratePdfRequest

    member = WorkspaceMember(workspace_id="ws-test", user_id="user-1", role="admin")
    ws = Workspace(id="ws-test", name="Physics Prep", owner_id="user-1")

    async def mock_member(db, w_id, u_id, minimum_role="viewer"):
        return member

    async def mock_ws(db, w_id):
        return ws

    monkeypatch.setattr(workspaces, "_member_or_error", mock_member)
    monkeypatch.setattr(workspaces, "_workspace_or_404", mock_ws)

    sample_task = Task(id="t-1", user_id="user-1", title="Solve Problem Set 4", priority="high", status="in_progress")
    sample_chat = Chat(id="c-1", user_id="user-1", title="Thermodynamics Derivation")
    sample_chat.messages = [
        Message(id="m-1", chat_id="c-1", role="user", content="Explain efficiency of Carnot cycle."),
        Message(id="m-2", chat_id="c-1", role="assistant", content="The Carnot cycle efficiency is eta = 1 - Tc/Th."),
    ]
    res_task = WorkspaceResource(workspace_id="ws-test", resource_type="task", resource_id="t-1", added_by_id="user-1")
    res_chat = WorkspaceResource(workspace_id="ws-test", resource_type="chat", resource_id="c-1", added_by_id="user-1")

    class MockScalars:
        def __init__(self, data):
            self._data = data
        def all(self):
            return self._data

    class MockDb:
        async def scalar(self, stmt):
            return None
        async def scalars(self, stmt):
            stmt_str = str(stmt)
            if "workspace_resources" in stmt_str:
                return MockScalars([res_task, res_chat])
            if "tasks" in stmt_str:
                return MockScalars([sample_task])
            if "chats" in stmt_str:
                return MockScalars([sample_chat])
            return MockScalars([])

    user = SimpleNamespace(id="user-1", full_name="Student Test", email="student@example.com")
    req = WorkspaceGeneratePdfRequest(
        title="Physics Exam Dossier",
        subtitle="Midterm Revision Packet",
        mode="verbatim",
    )
    resp = await workspaces.generate_workspace_pdf("ws-test", req, current_user=user, db=MockDb())

    assert resp.status_code == 200
    assert resp.media_type == "application/pdf"
    assert "Physics_Exam_Dossier.pdf" in resp.headers["Content-Disposition"]
    assert resp.body.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_generate_workspace_pdf_summary(monkeypatch):
    from app.schemas.workspace import WorkspaceGeneratePdfRequest

    member = WorkspaceMember(workspace_id="ws-test", user_id="user-1", role="admin")
    ws = Workspace(id="ws-test", name="Physics Prep", owner_id="user-1")

    async def mock_member(db, w_id, u_id, minimum_role="viewer"):
        return member

    async def mock_ws(db, w_id):
        return ws

    monkeypatch.setattr(workspaces, "_member_or_error", mock_member)
    monkeypatch.setattr(workspaces, "_workspace_or_404", mock_ws)

    sample_task = Task(id="t-1", user_id="user-1", title="Solve Problem Set 4", priority="high", status="in_progress")
    res_task = WorkspaceResource(workspace_id="ws-test", resource_type="task", resource_id="t-1", added_by_id="user-1")

    class MockScalars:
        def __init__(self, data):
            self._data = data
        def all(self):
            return self._data

    class MockDb:
        async def scalar(self, stmt):
            return None
        async def scalars(self, stmt):
            stmt_str = str(stmt)
            if "workspace_resources" in stmt_str:
                return MockScalars([res_task])
            if "tasks" in stmt_str:
                return MockScalars([sample_task])
            return MockScalars([])

    user = SimpleNamespace(id="user-1", full_name="Student Test", email="student@example.com")
    req = WorkspaceGeneratePdfRequest(
        title="Physics Summary Guide",
        mode="summary",
        custom_prompt="Synthesize key tasks and concepts",
    )
    resp = await workspaces.generate_workspace_pdf("ws-test", req, current_user=user, db=MockDb())

    assert resp.status_code == 200
    assert resp.media_type == "application/pdf"
    assert resp.body.startswith(b"%PDF-")
