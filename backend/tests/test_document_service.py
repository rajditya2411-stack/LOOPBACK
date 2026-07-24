from types import SimpleNamespace

import pytest

from app.services import document_service


class FakeDocumentSession:
    def __init__(self, document: SimpleNamespace) -> None:
        self.document = document
        self.chunk_rows: list[object] = []

    async def __aenter__(self):  # type: ignore[no-untyped-def]
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def get(self, _model: object, _document_id: str) -> SimpleNamespace:
        return self.document

    async def execute(self, _statement: object) -> None:
        return None

    def add_all(self, rows: list[object]) -> None:
        self.chunk_rows = rows

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None


class FakeCollection:
    def __init__(self) -> None:
        self.ids: list[str] = []
        self.upsert_payload: dict[str, object] | None = None
        self.deleted_ids: list[str] = []

    def get(self, *, ids=None, where=None, include=None):  # type: ignore[no-untyped-def]
        if ids is not None:
            return {"ids": [item for item in ids if item in self.ids]}
        return {"ids": list(self.ids) if where else []}

    def upsert(self, **kwargs: object) -> None:
        self.upsert_payload = kwargs
        self.ids = list(kwargs["ids"])  # type: ignore[arg-type]

    def delete(self, *, ids=None, where=None) -> None:  # type: ignore[no-untyped-def]
        if ids:
            self.deleted_ids.extend(ids)
            self.ids = [item for item in self.ids if item not in ids]


@pytest.mark.asyncio
async def test_store_document_vectors_persists_all_chunks_and_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    collection = FakeCollection()
    monkeypatch.setattr(document_service, "_collection", lambda: collection)

    async def embeddings(texts: list[str], **_kwargs: object) -> list[list[float]]:
        return [[float(index)] for index, _ in enumerate(texts)]

    monkeypatch.setattr(document_service, "_ai_embeddings", embeddings)
    document = SimpleNamespace(id="doc-1", user_id="user-1", title="Notes")

    await document_service._store_document_vectors(
        document,
        [("first chunk", 1), ("second chunk", 2)],
        ["doc-1:0", "doc-1:1"],
    )

    assert collection.ids == ["doc-1:0", "doc-1:1"]
    assert collection.upsert_payload is not None
    assert collection.upsert_payload["documents"] == ["first chunk", "second chunk"]
    assert collection.upsert_payload["metadatas"] == [
        {"user_id": "user-1", "document_id": "doc-1", "document_title": "Notes", "chunk_index": 0, "page_number": 1},
        {"user_id": "user-1", "document_id": "doc-1", "document_title": "Notes", "chunk_index": 1, "page_number": 2},
    ]


@pytest.mark.asyncio
async def test_store_document_vectors_keeps_previous_vectors_if_embedding_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    collection = FakeCollection()
    collection.ids = ["doc-1:0"]
    monkeypatch.setattr(document_service, "_collection", lambda: collection)

    async def no_embeddings(_texts: list[str], **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(document_service, "_ai_embeddings", no_embeddings)
    document = SimpleNamespace(id="doc-1", user_id="user-1", title="Notes")

    with pytest.raises(RuntimeError, match="Could not generate document embeddings"):
        await document_service._store_document_vectors(document, [("replacement", 1)], ["doc-1:0"])

    assert collection.ids == ["doc-1:0"]


@pytest.mark.asyncio
async def test_process_document_completes_with_sql_search_when_provider_is_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    document = SimpleNamespace(
        id="doc-local",
        user_id="user-1",
        title="Local notes",
        file_path="unused.txt",
        file_type="txt",
        status="pending",
        processing_error=None,
        page_count=None,
        word_count=None,
        summary=None,
    )
    session = FakeDocumentSession(document)
    monkeypatch.setattr(document_service, "async_session_factory", lambda: session)
    monkeypatch.setattr(document_service, "_extract_text", lambda _path, _type: ("Local searchable text", 1))
    monkeypatch.setattr(document_service.settings, "ai_provider", "gemini")
    monkeypatch.setattr(document_service.settings, "gemini_api_key", "")

    await document_service.process_document(document.id)

    assert document.status == "completed"
    assert document.processing_error is None
    assert len(session.chunk_rows) == 1
    assert getattr(session.chunk_rows[0], "embedding_id") is None


@pytest.mark.asyncio
async def test_reconciliation_skips_without_a_configured_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(document_service.settings, "ai_provider", "gemini")
    monkeypatch.setattr(document_service.settings, "gemini_api_key", "")

    def should_not_open_chroma() -> None:
        pytest.fail("Chroma should not be opened without an AI provider")

    monkeypatch.setattr(document_service, "_collection", should_not_open_chroma)
    await document_service.reconcile_document_indexes()
