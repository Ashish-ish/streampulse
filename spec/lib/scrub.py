"""Scrub playback error messages before they are queued.

URLs and leftover query strings are removed, then the result is cut to
`limit` characters. The schema rejects messages longer than 200.
"""

from __future__ import annotations

import re

_URL = re.compile(r"(?i)\b(?:https?://|www\.)\S+")
_QUERY = re.compile(r"\?[^\s]*")
_SPACE = re.compile(r"\s+")


def scrub_message(message: str, limit: int = 200) -> str:
    if limit < 0:
        raise ValueError("limit must be >= 0")
    cleaned = _URL.sub("[url]", message)
    cleaned = _QUERY.sub("", cleaned)
    cleaned = _SPACE.sub(" ", cleaned).strip()
    return cleaned[:limit]
