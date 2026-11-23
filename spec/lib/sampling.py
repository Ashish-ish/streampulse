"""Session sampling shared by every SDK.

A session is entirely in or entirely out. The decision is
SHA-256(session_id utf-8), first 8 bytes as a big-endian integer, modulo
1_000_000, compared with round-half-up(sample_rate * 1_000_000).
"""

from __future__ import annotations

import hashlib
from decimal import Decimal, ROUND_HALF_UP

MODULUS = 1_000_000


def sample_digest(session_id: str) -> bytes:
    return hashlib.sha256(session_id.encode("utf-8")).digest()[:8]


def sample_threshold(sample_rate: Decimal) -> int:
    if sample_rate < 0 or sample_rate > 1:
        raise ValueError("sample_rate must be between 0 and 1")
    scaled = (sample_rate * Decimal(MODULUS)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(scaled)


def session_included(session_id: str, sample_rate: Decimal) -> bool:
    threshold = sample_threshold(sample_rate)
    if threshold <= 0:
        return False
    if threshold >= MODULUS:
        return True
    bucket = int.from_bytes(sample_digest(session_id), "big") % MODULUS
    return bucket < threshold
