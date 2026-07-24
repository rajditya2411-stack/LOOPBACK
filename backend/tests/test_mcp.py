import pytest

from app.mcp.server import MCPServer


@pytest.mark.asyncio
async def test_mcp_lifecycle_and_tool_dispatch() -> None:
    server = MCPServer("test-server")
    events: list[str] = []

    @server.on_startup
    async def startup() -> None:
        events.append("started")

    @server.on_shutdown
    async def shutdown() -> None:
        events.append("stopped")

    @server.tool("echo", "Echo input", {"type": "object"})
    async def echo(arguments: dict) -> dict:
        return arguments

    await server.start()
    assert (await server.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))["result"]["tools"][0]["name"] == "echo"
    result = await server.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "echo", "arguments": {"ok": True}}})
    assert result["result"]["content"][0]["text"] == "{'ok': True}"
    await server.stop()
    assert events == ["started", "stopped"]


@pytest.mark.asyncio
async def test_mcp_invalid_method_is_structured() -> None:
    server = MCPServer("test-server")
    result = await server.handle({"jsonrpc": "2.0", "id": 1, "method": "missing"})
    assert result["error"]["code"] == -32601
