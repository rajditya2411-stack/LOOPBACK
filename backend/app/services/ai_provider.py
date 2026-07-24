"""Provider-neutral AI capabilities used by LoopBack's chat and retrieval services.

The application talks to this narrow interface instead of a vendor endpoint.  Adding a
provider requires one implementation plus a factory entry; RAG, SSE and persistence
remain independent of the selected inference vendor.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from dataclasses import dataclass

from app.core.config import settings


class AIProviderError(RuntimeError):
    """A recoverable provider-side configuration, transport, or response failure."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "provider_connection_failed",
        public_message: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.public_message = public_message or "Could not reach the AI service. Please retry."


@dataclass(frozen=True)
class AIMessage:
    role: str
    content: str


class AIProvider(Protocol):
    """The minimum model surface required by LoopBack's existing architecture."""

    @property
    def is_configured(self) -> bool: ...

    @property
    def supports_embeddings(self) -> bool: ...

    async def stream_text(self, messages: Sequence[AIMessage]) -> AsyncGenerator[str, None]: ...

    async def complete_text(self, messages: Sequence[AIMessage]) -> str: ...

    async def embed_texts(
        self, texts: Sequence[str], *, task_type: str | None = None
    ) -> list[list[float]]: ...


@dataclass(frozen=True)
class ProviderConfig:
    """Credentials and preferences for one request; never sent to the browser."""
    provider: str
    api_key: str
    model: str
    temperature: float = 0.7


class OpenAICompatibleProvider:
    """Common adapter for OpenAI, xAI, and Kimi's compatible chat APIs."""
    def __init__(self, config: ProviderConfig, base_url: str):
        self.config, self.base_url = config, base_url.rstrip("/")

    async def complete_text(self, messages: Sequence[dict[str, str]]) -> str:
        if not self.config.api_key.strip():
            raise AIProviderError("An API key is required")
        payload = {"model": self.config.model, "messages": list(messages), "temperature": self.config.temperature}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10)) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers={"Authorization": f"Bearer {self.config.api_key}", "Content-Type": "application/json"}, json=payload)
            if response.status_code >= 400:
                raise AIProviderError(f"{self.config.provider} returned HTTP {response.status_code}")
            choices = response.json().get("choices", [])
            text = choices[0].get("message", {}).get("content", "") if choices else ""
            if not text:
                raise AIProviderError(f"{self.config.provider} returned no text")
            return str(text)
        except httpx.HTTPError as exc:
            raise AIProviderError(f"Could not reach {self.config.provider}") from exc


class AnthropicProvider:
    def __init__(self, config: ProviderConfig): self.config = config

    async def complete_text(self, messages: Sequence[dict[str, str]]) -> str:
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        body = {"model": self.config.model, "max_tokens": 1024, "temperature": self.config.temperature, "messages": [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"]}
        if system: body["system"] = system
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10)) as client:
                response = await client.post("https://api.anthropic.com/v1/messages", headers={"x-api-key": self.config.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, json=body)
            if response.status_code >= 400: raise AIProviderError(f"Anthropic returned HTTP {response.status_code}")
            blocks = response.json().get("content", [])
            text = "".join(b.get("text", "") for b in blocks if isinstance(b, dict))
            if not text: raise AIProviderError("Anthropic returned no text")
            return text
        except httpx.HTTPError as exc: raise AIProviderError("Could not reach Anthropic") from exc


class ProviderManager:
    """Single extension point for per-user BYOK inference."""
    def __init__(self, config: ProviderConfig): self.config = config

    async def stream_text(self, messages: Sequence[dict[str, str]]) -> AsyncGenerator[str, None]:
        """Provider-neutral stream contract; adapters can replace this with native SSE."""
        answer = await self.complete_text(messages)
        for index in range(0, len(answer), 32):
            yield answer[index:index + 32]

    async def complete_text(self, messages: Sequence[dict[str, str]]) -> str:
        provider = self.config.provider.lower()
        if provider == "anthropic": return await AnthropicProvider(self.config).complete_text(messages)
        if provider == "gemini":
            contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
            system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
            body: dict[str, Any] = {"contents": contents, "generationConfig": {"temperature": self.config.temperature}}
            if system: body["systemInstruction"] = {"parts": [{"text": system}]}
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10)) as client:
                    response = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{self.config.model}:generateContent", headers={"x-goog-api-key": self.config.api_key}, json=body)
                if response.status_code >= 400: raise AIProviderError(f"Gemini returned HTTP {response.status_code}")
                text = _gemini_text(response.json())
                if not text: raise AIProviderError("Gemini returned no text")
                return text
            except httpx.HTTPError as exc: raise AIProviderError("Could not reach Gemini") from exc
        bases = {"openai": "https://api.openai.com/v1", "xai": "https://api.x.ai/v1", "kimi": "https://api.moonshot.ai/v1"}
        if provider not in bases: raise AIProviderError(f"Unsupported AI provider: {provider}")
        return await OpenAICompatibleProvider(self.config, bases[provider]).complete_text(messages)


def _placeholder(value: str) -> bool:
    return not value.strip() or value.strip().lower().startswith(("your-", "replace-", "changeme"))


def _gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates or not isinstance(candidates[0], dict):
        return ""
    content = candidates[0].get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    return "".join(part.get("text", "") for part in parts if isinstance(part, dict) and isinstance(part.get("text"), str))


def _openai_compatible_text(payload: dict[str, Any]) -> str:
    """Extract a streaming delta from an OpenAI-compatible response."""
    response = payload.get("response")
    if isinstance(response, str):
        return response
    choices = payload.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        delta = choices[0].get("delta") or choices[0].get("message") or {}
        if isinstance(delta, dict) and isinstance(delta.get("content"), str):
            return delta["content"]
    return ""


class GeminiProvider:
    """Small HTTPX-based Gemini Developer API adapter with no SDK dependency."""

    api_base = "https://generativelanguage.googleapis.com/v1beta"

    @property
    def is_configured(self) -> bool:
        return not _placeholder(settings.gemini_api_key)

    @property
    def supports_embeddings(self) -> bool:
        return True

    def _headers(self) -> dict[str, str]:
        if not self.is_configured:
            raise AIProviderError("Gemini API is not configured")
        return {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}

    @staticmethod
    def _payload(messages: Sequence[AIMessage]) -> dict[str, Any]:
        system_parts = [message.content for message in messages if message.role == "system" and message.content.strip()]
        contents = [
            {
                "role": "model" if message.role == "assistant" else "user",
                "parts": [{"text": message.content}],
            }
            for message in messages
            if message.role != "system" and message.content.strip()
        ]
        if not contents:
            raise AIProviderError("No user or assistant content was supplied to Gemini")
        payload: dict[str, Any] = {"contents": contents}
        if system_parts:
            payload["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_parts)}]}
        return payload

    async def stream_text(self, messages: Sequence[AIMessage]) -> AsyncGenerator[str, None]:
        payload = self._payload(messages)
        url = f"{self.api_base}/models/{settings.ai_model}:streamGenerateContent?alt=sse"
        timeout = httpx.Timeout(settings.chat_stream_timeout_seconds, connect=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, headers=self._headers(), json=payload) as response:
                    if response.status_code != 200:
                        detail = (await response.aread()).decode("utf-8", errors="replace")[:500]
                        raise AIProviderError(f"Gemini returned HTTP {response.status_code}: {detail}")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        try:
                            payload = json.loads(raw)
                        except json.JSONDecodeError as exc:
                            raise AIProviderError("Gemini returned malformed streaming data") from exc
                        text = _gemini_text(payload)
                        if text:
                            yield text
        except httpx.HTTPError as exc:
            raise AIProviderError("Could not reach Gemini") from exc

    async def complete_text(self, messages: Sequence[AIMessage]) -> str:
        url = f"{self.api_base}/models/{settings.ai_model}:generateContent"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
                response = await client.post(url, headers=self._headers(), json=self._payload(messages))
                if response.status_code != 200:
                    raise AIProviderError(f"Gemini returned HTTP {response.status_code}")
                text = _gemini_text(response.json()).strip()
                if not text:
                    raise AIProviderError("Gemini returned no text content")
                return text
        except httpx.HTTPError as exc:
            raise AIProviderError("Could not reach Gemini") from exc

    async def embed_texts(
        self, texts: Sequence[str], *, task_type: str | None = None
    ) -> list[list[float]]:
        cleaned = [text.strip() for text in texts]
        if not cleaned:
            return []
        config: dict[str, Any] = {"outputDimensionality": settings.ai_embedding_dimensions}
        if task_type:
            config["taskType"] = task_type
        request = {
            "requests": [
                {
                    "model": f"models/{settings.ai_embedding_model}",
                    "content": {"parts": [{"text": text}]},
                    "embedContentConfig": config,
                }
                for text in cleaned
            ]
        }
        url = f"{self.api_base}/models/{settings.ai_embedding_model}:batchEmbedContents"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
                response = await client.post(url, headers=self._headers(), json=request)
                if response.status_code != 200:
                    raise AIProviderError(f"Gemini embeddings returned HTTP {response.status_code}")
                embeddings = response.json().get("embeddings")
        except httpx.HTTPError as exc:
            raise AIProviderError("Could not reach Gemini embeddings") from exc
        if not isinstance(embeddings, list) or len(embeddings) != len(cleaned):
            raise AIProviderError("Gemini returned an invalid embedding payload")
        vectors = [item.get("values") if isinstance(item, dict) else None for item in embeddings]
        if any(not isinstance(vector, list) or len(vector) != settings.ai_embedding_dimensions for vector in vectors):
            raise AIProviderError("Gemini returned embeddings with an unexpected dimension")
        return [[float(value) for value in vector] for vector in vectors]


class XAIProvider:
    """xAI's OpenAI-compatible Chat Completions adapter.

    xAI chat streams use the standard OpenAI SSE delta shape, allowing the
    application to retain its existing streaming and persistence behavior.
    """

    api_base = "https://api.x.ai/v1"

    @property
    def is_configured(self) -> bool:
        return not _placeholder(settings.xai_api_key)

    @property
    def supports_embeddings(self) -> bool:
        return False

    def _headers(self) -> dict[str, str]:
        if not self.is_configured:
            raise AIProviderError("xAI API is not configured")
        return {
            "Authorization": f"Bearer {settings.xai_api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _messages(messages: Sequence[AIMessage]) -> list[dict[str, str]]:
        payload = [
            {"role": message.role, "content": message.content}
            for message in messages
            if message.content.strip()
        ]
        if not payload:
            raise AIProviderError("No chat content was supplied to xAI")
        return payload

    async def stream_text(self, messages: Sequence[AIMessage]) -> AsyncGenerator[str, None]:
        payload = {
            "model": settings.ai_model,
            "messages": self._messages(messages),
            "stream": True,
        }
        timeout = httpx.Timeout(settings.chat_stream_timeout_seconds, connect=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.api_base}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                ) as response:
                    if response.status_code in {401, 403}:
                        detail = (await response.aread()).decode("utf-8", errors="replace")[:500]
                        if response.status_code == 403 and any(
                            phrase in detail.lower()
                            for phrase in ("no credits", "no licenses", "credits or licenses")
                        ):
                            raise AIProviderError(
                                "xAI rejected the request because the configured team has no credits or licenses",
                                code="provider_account_unfunded",
                                public_message=(
                                    "The configured xAI account has no credits or licenses. "
                                    "Add an xAI API credit or license, then retry."
                                ),
                            )
                        raise AIProviderError(
                            "xAI rejected the configured credentials",
                            code="provider_unauthorized",
                            public_message="xAI rejected this request. Verify the configured API key and account access.",
                        )
                    if response.status_code != 200:
                        detail = (await response.aread()).decode("utf-8", errors="replace")[:500]
                        raise AIProviderError(f"xAI returned HTTP {response.status_code}: {detail}")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        try:
                            text = _openai_compatible_text(json.loads(raw))
                        except json.JSONDecodeError as exc:
                            raise AIProviderError("xAI returned malformed streaming data") from exc
                        if text:
                            yield text
        except httpx.HTTPError as exc:
            raise AIProviderError("Could not reach xAI") from exc

    async def complete_text(self, messages: Sequence[AIMessage]) -> str:
        chunks = [chunk async for chunk in self.stream_text(messages)]
        text = "".join(chunks).strip()
        if not text:
            raise AIProviderError("xAI returned no text content")
        return text

    async def embed_texts(
        self, texts: Sequence[str], *, task_type: str | None = None
    ) -> list[list[float]]:
        del texts, task_type
        raise AIProviderError(
            "xAI chat is configured, but no xAI embedding model is configured; using lexical retrieval fallback."
        )


class CloudflareProvider:
    """Deprecated adapter retained only for one-time migration compatibility.

    It is intentionally not registered by ProviderManager or get_ai_provider.
    """

    @property
    def is_configured(self) -> bool:
        return bool(getattr(settings, "cloudflare_account_id", "").strip() and getattr(settings, "cloudflare_api_token", "").strip())

    @property
    def supports_embeddings(self) -> bool:
        return True

    def _headers(self) -> dict[str, str]:
        if not self.is_configured:
            raise AIProviderError("Cloudflare AI is not configured")
        return {"Authorization": f"Bearer {getattr(settings, 'cloudflare_api_token', '')}"}

    def _models(self) -> tuple[str, ...]:
        models = tuple(dict.fromkeys(
            model.strip()
            for model in (getattr(settings, "cloudflare_ai_model", ""), getattr(settings, "cloudflare_ai_fallback_model", ""))
            if model.strip()
        ))
        if not models:
            raise AIProviderError("No Cloudflare chat model is configured")
        return models

    def _url(self, model: str) -> str:
        return f"https://api.cloudflare.com/client/v4/accounts/{getattr(settings, 'cloudflare_account_id', '')}/ai/run/{model}"

    @staticmethod
    def _messages(messages: Sequence[AIMessage]) -> list[dict[str, str]]:
        result = [
            {"role": message.role, "content": message.content}
            for message in messages
            if message.content.strip()
        ]
        if not result:
            raise AIProviderError("No chat content was supplied to Cloudflare")
        return result

    async def stream_text(self, messages: Sequence[AIMessage]) -> AsyncGenerator[str, None]:
        payload = {"messages": self._messages(messages), "stream": True}
        timeout = httpx.Timeout(settings.chat_stream_timeout_seconds, connect=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                for model in self._models():
                    async with client.stream("POST", self._url(model), headers=self._headers(), json=payload) as response:
                        if response.status_code in {401, 403}:
                            raise AIProviderError("Cloudflare AI rejected the configured credentials")
                        if response.status_code != 200:
                            continue
                        async for line in response.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            raw = line[5:].strip()
                            if not raw or raw == "[DONE]":
                                continue
                            try:
                                text = _openai_compatible_text(json.loads(raw))
                            except json.JSONDecodeError as exc:
                                raise AIProviderError("Cloudflare returned malformed streaming data") from exc
                            if text:
                                yield text
                        return
        except httpx.HTTPError as exc:
            raise AIProviderError("Could not reach Cloudflare AI") from exc
        raise AIProviderError("No configured Cloudflare AI model is available")

    async def complete_text(self, messages: Sequence[AIMessage]) -> str:
        chunks = [chunk async for chunk in self.stream_text(messages)]
        text = "".join(chunks).strip()
        if not text:
            raise AIProviderError("Cloudflare returned no text content")
        return text

    async def embed_texts(
        self, texts: Sequence[str], *, task_type: str | None = None
    ) -> list[list[float]]:
        del task_type  # Workers AI BGE-M3 does not accept task-type configuration.
        cleaned = [text.strip() for text in texts]
        if not cleaned:
            return []
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
                response = await client.post(
                    self._url(getattr(settings, "cloudflare_embedding_model", "")),
                    headers=self._headers(),
                    json={"text": cleaned},
                )
                if response.status_code != 200:
                    raise AIProviderError(f"Cloudflare embeddings returned HTTP {response.status_code}")
                result = response.json().get("result", {})
        except httpx.HTTPError as exc:
            raise AIProviderError("Could not reach Cloudflare embeddings") from exc
        vectors = (result.get("data") or result.get("embedding")) if isinstance(result, dict) else None
        if isinstance(vectors, list) and vectors and isinstance(vectors[0], (int, float)):
            vectors = [vectors]
        if not isinstance(vectors, list) or len(vectors) != len(cleaned):
            raise AIProviderError("Cloudflare returned an invalid embedding payload")
        if any(not isinstance(vector, list) for vector in vectors):
            raise AIProviderError("Cloudflare returned invalid embedding values")
        try:
            return [[float(value) for value in vector] for vector in vectors]
        except (TypeError, ValueError) as exc:
            raise AIProviderError("Cloudflare returned invalid embedding values") from exc


def get_ai_provider() -> AIProvider:
    """Resolve the configured provider without leaking it into application services."""
    providers: dict[str, AIProvider] = {
        "gemini": GeminiProvider(),
        "xai": XAIProvider(),
    }
    provider_name = settings.ai_provider.strip().lower()
    try:
        return providers[provider_name]
    except KeyError as exc:
        raise AIProviderError(f"Unsupported AI provider: {provider_name or '(empty)'}") from exc
