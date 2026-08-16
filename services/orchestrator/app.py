"""Vercel entrypoint for the trusted Kiln orchestration service."""

from kiln_orchestrator.main import app

__all__ = ["app"]
