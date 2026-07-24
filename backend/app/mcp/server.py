"""Transport-neutral MCP-style server runtime.

The runtime implements the small JSON-RPC surface needed by MCP hosts while
keeping transports out of the domain layer. HTTP, stdio, and future transports
can all feed requests to :meth:`MCPServer.handle`.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

ToolHandler = Callable[[dict[str, Any]], Awaitable[Any] | Any]
Hook = Callable[..., Awaitable[None] | None]
log = logging.getLogger("loopback.mcp")


@dataclass(frozen=True)
class MCPTool:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler


@dataclass
class MCPServer:
    name: str
    version: str = "1.0.0"
    _tools: dict[str, MCPTool] = field(default_factory=dict, init=False)
    _started: bool = field(default=False, init=False)
    _startup_hooks: list[Hook] = field(default_factory=list, init=False)
    _shutdown_hooks: list[Hook] = field(default_factory=list, init=False)

    def tool(self, name: str, description: str, input_schema: dict[str, Any]):
        def register(handler: ToolHandler) -> ToolHandler:
            if name in self._tools:
                raise ValueError(f"Tool already registered: {name}")
            self._tools[name] = MCPTool(name, description, input_schema, handler)
            return handler
        return register

    def on_startup(self, hook: Hook) -> Hook:
        self._startup_hooks.append(hook)
        return hook

    def on_shutdown(self, hook: Hook) -> Hook:
        self._shutdown_hooks.append(hook)
        return hook

    async def start(self) -> None:
        if self._started:
            return
        for hook in self._startup_hooks:
            await _maybe_await(hook())
        self._started = True

    async def stop(self) -> None:
        if not self._started:
            return
        for hook in reversed(self._shutdown_hooks):
            await _maybe_await(hook())
        self._started = False

    def list_tools(self) -> list[dict[str, Any]]:
        return [{"name": t.name, "description": t.description, "inputSchema": t.input_schema} for t in self._tools.values()]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        tool = self._tools.get(name)
        if tool is None:
            return _error(-32602, f"Unknown tool: {name}")
        try:
            result = await _maybe_await(tool.handler(arguments))
            return {"content": [{"type": "text", "text": str(result)}]}
        except Exception:
            log.exception("mcp_tool_failed", extra={"tool": name})
            return _error(-32603, "Tool execution failed")

    async def handle(self, request: dict[str, Any]) -> dict[str, Any] | None:
        """Dispatch one JSON-RPC request; notifications return ``None``."""
        request_id = request.get("id")
        if request.get("jsonrpc") != "2.0" or not isinstance(request.get("method"), str):
            return _response(request_id, error={"code": -32600, "message": "Invalid Request"})
        method, params = request["method"], request.get("params") or {}
        try:
            if method == "initialize":
                result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": self.name, "version": self.version}}
            elif method == "tools/list":
                result = {"tools": self.list_tools()}
            elif method == "tools/call":
                result = await self.call_tool(params["name"], params.get("arguments", {}))
            elif method == "notifications/initialized":
                return None
            else:
                return _response(request_id, error={"code": -32601, "message": "Method not found"})
            return None if "id" not in request else _response(request_id, result=result)
        except (KeyError, TypeError):
            return _response(request_id, error={"code": -32602, "message": "Invalid params"})


async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


def _error(code: int, message: str) -> dict[str, Any]:
    return {"isError": True, "error": {"code": code, "message": message}}


def _response(request_id: Any, *, result: Any = None, error: dict[str, Any] | None = None) -> dict[str, Any]:
    response = {"jsonrpc": "2.0", "id": request_id}
    response["error" if error else "result"] = error or result
    return response
