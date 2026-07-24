"""Unit coverage for provider-neutral Gemini request translation."""

import json

import pytest

from app.services import ai_provider


def test_gemini_payload_preserves_system_instruction_and_history() -> None:
    payload = ai_provider.GeminiProvider._payload([
        ai_provider.AIMessage(role="system", content="Follow workspace evidence."),
        ai_provider.AIMessage(role="user", content="What is due today?"),
        ai_provider.AIMessage(role="assistant", content="I will check."),
    ])

    assert payload["systemInstruction"]["parts"][0]["text"] == "Follow workspace evidence."
    assert payload["contents"] == [
        {"role": "user", "parts": [{"text": "What is due today?"}]},
        {"role": "model", "parts": [{"text": "I will check."}]},
    ]


@pytest.mark.asyncio
async def test_gemini_stream_yields_sse_text_chunks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_provider.settings, "gemini_api_key", "test-key")

    class FakeResponse:
        status_code = 200

        async def __aenter__(self) -> "FakeResponse":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def aiter_lines(self):
            yield 'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}'
            yield 'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}'

    class FakeClient:
        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        def stream(self, *_args: object, **_kwargs: object) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr(ai_provider.httpx, "AsyncClient", lambda **_kwargs: FakeClient())
    provider = ai_provider.GeminiProvider()
    chunks = [
        chunk async for chunk in provider.stream_text([
            ai_provider.AIMessage(role="user", content="Hi"),
        ])
    ]

    assert chunks == ["Hello", " world"]


@pytest.mark.asyncio
async def test_gemini_embeddings_keep_configured_chroma_dimension(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_provider.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(ai_provider.settings, "ai_embedding_dimensions", 3)
    observed: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"embeddings": [{"values": [0.1, 0.2, 0.3]}]}

    class FakeClient:
        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def post(self, _url: str, **kwargs: object) -> FakeResponse:
            observed.update(kwargs)
            return FakeResponse()

    monkeypatch.setattr(ai_provider.httpx, "AsyncClient", lambda **_kwargs: FakeClient())
    vectors = await ai_provider.GeminiProvider().embed_texts(["project plan"], task_type="RETRIEVAL_DOCUMENT")

    assert vectors == [[0.1, 0.2, 0.3]]
    request = observed["json"]
    assert isinstance(request, dict)
    config = request["requests"][0]["embedContentConfig"]
    assert config == {"outputDimensionality": 3, "taskType": "RETRIEVAL_DOCUMENT"}


@pytest.mark.asyncio
async def test_xai_no_credits_error_is_actionable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_provider.settings, "xai_api_key", "test-key")

    class FakeResponse:
        status_code = 403

        async def __aenter__(self) -> "FakeResponse":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def aread(self) -> bytes:
            return b'{"error":"Your newly created team does not have any credits or licenses yet."}'

    class FakeClient:
        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        def stream(self, *_args: object, **_kwargs: object) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr(ai_provider.httpx, "AsyncClient", lambda **_kwargs: FakeClient())
    with pytest.raises(ai_provider.AIProviderError) as error:
        _ = [
            chunk async for chunk in ai_provider.XAIProvider().stream_text([
                ai_provider.AIMessage(role="user", content="Hi"),
            ])
        ]

    assert error.value.code == "provider_account_unfunded"
    assert "no credits or licenses" in error.value.public_message
    assert ai_provider.XAIProvider().supports_embeddings is False
