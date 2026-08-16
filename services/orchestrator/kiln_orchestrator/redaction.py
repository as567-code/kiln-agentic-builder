from __future__ import annotations

import re

_PATTERNS = (
    re.compile(r"(?i)(authorization:\s*(?:bearer|basic)\s+)[^\s]+"),
    re.compile(r"(?i)((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
)


def redact(value: str, *, limit: int = 8_192) -> str:
    bounded = value[:limit]
    for pattern in _PATTERNS:
        bounded = pattern.sub(
            lambda match: f"{match.group(1) if match.groups() else ''}[REDACTED]",
            bounded,
        )
    return bounded
