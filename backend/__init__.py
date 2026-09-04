"""AI-made UEFN desktop plugin — register MCP tools when enabled.

The real tool surface lives in ``backend/register.py``; this package entry just
delegates to it so plugin.json's ``backend.register`` hook reaches all rgd_*
tools instead of the scaffold stub.
"""

from __future__ import annotations

from .register import register

__all__ = ["register"]
