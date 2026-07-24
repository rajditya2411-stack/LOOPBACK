"""Deterministic local launcher that migrates before publishing its port."""

import asyncio
import os
import socket
import subprocess
import sys
from pathlib import Path

import uvicorn

from app.core.windows_asyncio import configure_windows_asyncio


configure_windows_asyncio()

ROOT = Path(__file__).resolve().parent
PORT_FILE = ROOT / "backend-port.txt"


def _local_ports() -> range:
    start = int(os.getenv("LOOPBACK_LOCAL_PORT_START", "19000"))
    end = int(os.getenv("LOOPBACK_LOCAL_PORT_END", "19999"))
    if not 1 <= start <= end <= 65535:
        raise RuntimeError("LoopBack local port range must be within 1-65535")
    return range(start, end + 1)


def _run_migrations() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        check=False,
    )
    if result.returncode:
        raise RuntimeError("Database migration failed; backend startup was cancelled")


def _publish_port(port: int) -> None:
    temporary = PORT_FILE.with_suffix(".tmp")
    temporary.write_text(str(port), encoding="utf-8")
    temporary.replace(PORT_FILE)


async def _serve() -> None:
    host = os.getenv("LOOPBACK_BACKEND_HOST", "127.0.0.1")
    configured_port = os.getenv("LOOPBACK_BACKEND_PORT")
    ports = [int(configured_port)] if configured_port else _local_ports()
    sock: socket.socket | None = None
    last_error: OSError | None = None
    for candidate in ports:
        attempt = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        attempt.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            attempt.bind((host, candidate))
            attempt.listen(2048)
            sock = attempt
            break
        except OSError as exc:
            last_error = exc
            attempt.close()
    if sock is None:
        target = configured_port or f"{_local_ports().start}-{_local_ports().stop - 1}"
        raise RuntimeError(f"Could not bind LoopBack backend to {host}:{target}: {last_error}")

    port = int(sock.getsockname()[1])
    config = uvicorn.Config("app.main:app", host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        while not server.started and not server_task.done():
            await asyncio.sleep(0.05)
        if not server.started:
            await server_task
            raise RuntimeError("Uvicorn exited before completing application startup")
        _publish_port(port)
        print(f"LoopBack backend listening at http://{host}:{port}", flush=True)
        await server_task
    finally:
        if PORT_FILE.exists() and PORT_FILE.read_text(encoding="utf-8").strip() == str(port):
            PORT_FILE.unlink()
        sock.close()


if __name__ == "__main__":
    # A port file is a readiness hand-off, never a record of a past process.
    PORT_FILE.unlink(missing_ok=True)
    _run_migrations()
    asyncio.run(_serve())
