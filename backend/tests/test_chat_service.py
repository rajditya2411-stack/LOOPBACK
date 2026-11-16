"""Focused tests for Phase 3 chat retrieval and streaming behavior."""

import json
from types import SimpleNamespace

import pytest

from app.schemas.document import DocumentSearchResult
from app.services import ai_provider, chat_service
from app.services import document_service
from app.services import memory_service
from app.services.workspace_context_service import WorkspaceContext


def test_document_context_returns_only_citations_that_fit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(chat_service.settings, "rag_max_context_chars", 80)
    monkeypatch.setattr(chat_service.settings, "rag_max_context_tokens", 100)
    matches = [
        DocumentSearchResult(
            document_id="doc-1", document_title="Plan", chunk_content="alpha " * 40,
            chunk_index=2, page_number=4, relevance_score=0.91,
        ),
        DocumentSearchResult(
            document_id="doc-2", document_title="Notes", chunk_content="beta " * 40,
            chunk_index=0, page_number=None, relevance_score=0.8,
        ),
    ]

    context, citations = chat_service._document_context(matches)

    assert len(context) <= 80
    assert citations == [{
        "document_id": "doc-1", "document_title": "Plan", "chunk_index": 2,
        "page_number": 4, "relevance_score": 0.91,
    }]


def test_history_keeps_newest_messages_within_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(chat_service.settings, "chat_max_history_messages", 3)
    monkeypatch.setattr(chat_service.settings, "chat_max_history_tokens", 6)
    messages = [
        SimpleNamespace(role="user", content="first message"),
        SimpleNamespace(role="assistant", content="second message"),
        SimpleNamespace(role="user", content="latest"),
    ]

    payload = chat_service._history_payload(messages)

    assert payload == [
        {"role": "assistant", "content": "second message"},
        {"role": "user", "content": "latest"},
    ]


def test_chroma_collection_persists_a_document_vector(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """The persisted vector store remains readable through a new client."""
    monkeypatch.setattr(document_service.settings, "chroma_persist_dir", str(tmp_path / "chroma"))
    collection = document_service._collection()
    assert collection is not None
    collection.upsert(
        ids=["doc-1:0"],
        documents=["A project planning note."],
        embeddings=[[1.0, 0.0]],
        metadatas=[{"user_id": "user-1", "document_id": "doc-1", "chunk_index": 0}],
    )

    reopened = document_service._collection()
    assert reopened is not None
    result = reopened.get(ids=["doc-1:0"], include=["documents", "metadatas"])
    assert result["documents"] == ["A project planning note."]
    assert result["metadatas"][0]["user_id"] == "user-1"


def test_placeholder_gemini_values_are_not_treated_as_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(chat_service.settings, "ai_provider", "gemini")
    monkeypatch.setattr(chat_service.settings, "gemini_api_key", "your-gemini-api-key")
    assert chat_service.settings.ai_provider_configured is False
    assert "Gemini" in chat_service.settings.ai_provider_configuration_error



def test_memory_extraction_parser_filters_weak_and_unsupported_candidates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(memory_service.settings, "memory_extraction_min_confidence", 0.7)
    extracted = memory_service._parse_extraction("""```json
    {"memories": [
      {"content": "The user prefers Python.", "category": "preference", "confidence": 0.91},
      {"content": "A temporary request.", "category": "general", "confidence": 0.2},
      {"content": "Unsupported.", "category": "private", "confidence": 0.99}
    ]}
    ```""")

    assert [(memory.content, memory.category) for memory in extracted.memories] == [
        ("The user prefers Python.", "preference"),
    ]


@pytest.mark.asyncio
async def test_memory_search_fallback_ranks_relevant_user_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    matching = SimpleNamespace(
        id="memory-1", content="The user prefers a Python backend.", category="preference",
        source="manual", is_pinned=False, relevance_score=1.0,
    )
    pinned = SimpleNamespace(
        id="memory-2", content="Keep responses concise.", category="instruction",
        source="manual", is_pinned=True, relevance_score=1.0,
    )

    class FakeScalars:
        def __init__(self, values: list[object]) -> None:
            self.values = values

        def all(self) -> list[object]:
            return self.values

    class FakeDb:
        def __init__(self) -> None:
            self.calls = 0

        async def scalars(self, _query: object) -> FakeScalars:
            self.calls += 1
            return FakeScalars([matching, pinned] if self.calls == 1 else [pinned])

    monkeypatch.setattr(memory_service, "_collection", lambda: None)

    async def no_embeddings(_texts: list[str], **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(memory_service, "_ai_embeddings", no_embeddings)
    results = await memory_service.search_user_memories(FakeDb(), "user-1", "Python backend")

    assert [result.id for result in results] == ["memory-1", "memory-2"]


@pytest.mark.asyncio
async def test_stream_persists_citations_and_emits_structured_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeScalars:
        def __init__(self, values: list[object]) -> None:
            self.values = values

        def all(self) -> list[object]:
            return self.values

    class FakeDb:
        def __init__(self) -> None:
            self.added: list[object] = []

        def add(self, value: object) -> None:
            self.added.append(value)

        async def commit(self) -> None:
            return None

        async def scalars(self, _query: object) -> FakeScalars:
            return FakeScalars([SimpleNamespace(role="user", content="Question")])

    class FakeProvider:
        async def stream_text(self, _messages: object):
            yield "Hello"

    citation_match = DocumentSearchResult(
        document_id="doc-1", document_title="Plan", chunk_content="Relevant plan excerpt.",
        chunk_index=0, page_number=1, relevance_score=0.9,
    )
    async def fake_chat(*_args: object) -> None:
        return None

    async def fake_documents(*_args: object, **_kwargs: object) -> list[DocumentSearchResult]:
        return [citation_match]

    async def fake_workspace(*_args: object) -> WorkspaceContext:
        return WorkspaceContext(content="", item_count=0)

    async def no_extraction(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(chat_service, "get_chat_with_messages", fake_chat)
    monkeypatch.setattr(chat_service, "search_user_documents", fake_documents)
    monkeypatch.setattr(chat_service, "build_workspace_context", fake_workspace)
    monkeypatch.setattr(chat_service, "extract_memories_from_turn", no_extraction)
    monkeypatch.setattr(chat_service, "get_ai_provider", lambda: FakeProvider())
    db = FakeDb()

    generator = await chat_service.stream_chat_response(db, "user-1", "chat-1", "Question")
    events = [json.loads(event.split("data: ", 1)[1]) for event in [item async for item in generator]]

    assert events[0] == [{"document_id": "doc-1", "document_title": "Plan", "chunk_index": 0, "page_number": 1, "relevance_score": 0.9}]
    assert events[1] == {"content": "Hello"}
    assistant_message = db.added[-1]
    assert assistant_message.content == "Hello"
    assert assistant_message.citations == events[0]
