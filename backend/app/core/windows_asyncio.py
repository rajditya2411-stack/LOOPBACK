"""Windows asyncio compatibility for local endpoint-security policies."""

from __future__ import annotations

import asyncio
import os
import socket
import sys


_configured = False
_original_socketpair = socket.socketpair


def _fallback_ports() -> range:
    """Return the local service range instead of relying on blocked port zero."""
    start = int(os.getenv("LOOPBACK_LOCAL_PORT_START", "19000"))
    end = int(os.getenv("LOOPBACK_LOCAL_PORT_END", "19999"))
    if not 1 <= start <= end <= 65535:
        raise RuntimeError("LoopBack local port range must be within 1-65535")
    return range(start, end + 1)


def _restricted_socketpair(
    family: socket.AddressFamily = socket.AF_INET,
    type: socket.SocketKind = socket.SOCK_STREAM,
    proto: int = 0,
) -> tuple[socket.socket, socket.socket]:
    """Fall back to an explicitly probeable loopback range on Windows.

    Python implements ``socketpair`` on Windows with a listener on port zero.
    Some endpoint-security configurations reject that listener with WinError
    10013.  The fallback does not reserve a magic port: it probes the same
    configurable local range used by the launcher and returns the first pair
    that completed a real loopback connection.
    """
    try:
        return _original_socketpair(family, type, proto)
    except PermissionError as native_error:
        if family not in (socket.AF_INET, socket.AF_INET6) or type != socket.SOCK_STREAM or proto != 0:
            raise

        host = "127.0.0.1" if family == socket.AF_INET else "::1"
        last_error: OSError = native_error
        for port in _fallback_ports():
            listener = socket.socket(family, type, proto)
            try:
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                listener.bind((host, port))
                listener.listen(1)
                connector = socket.socket(family, type, proto)
                try:
                    connector.settimeout(1)
                    connector.connect(listener.getsockname())
                    acceptor, _ = listener.accept()
                    connector.settimeout(None)
                    return acceptor, connector
                except Exception:
                    connector.close()
                    raise
            except OSError as exc:
                last_error = exc
            finally:
                listener.close()
        raise RuntimeError(
            "No usable LoopBack local port is available. Set "
            "LOOPBACK_LOCAL_PORT_START and LOOPBACK_LOCAL_PORT_END to an "
            "allowed local range."
        ) from last_error


def configure_windows_asyncio() -> None:
    """Use the supported Windows selector loop and guarded fallback once."""
    global _configured
    if sys.platform != "win32" or _configured:
        return

    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    socket.socketpair = _restricted_socketpair
    _configured = True
