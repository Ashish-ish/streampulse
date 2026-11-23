"""Half-open integer interval arithmetic used by the metric oracle.

Intervals are [start, end) in milliseconds. A zero or negative length is empty.
"""

from __future__ import annotations

Interval = tuple[int, int]


def measure(intervals: list[Interval]) -> int:
    return sum(end - start for start, end in intervals if end > start)


def clip(intervals: list[Interval], start: int, end: int) -> list[Interval]:
    clipped: list[Interval] = []
    for item_start, item_end in intervals:
        left = max(item_start, start)
        right = min(item_end, end)
        if right > left:
            clipped.append((left, right))
    return clipped


def subtract_one(interval: Interval, cut: Interval) -> list[Interval]:
    start, end = interval
    cut_start, cut_end = cut
    if end <= start:
        return []
    if cut_end <= start or cut_start >= end or cut_end <= cut_start:
        return [(start, end)]
    pieces: list[Interval] = []
    if cut_start > start:
        pieces.append((start, cut_start))
    if cut_end < end:
        pieces.append((cut_end, end))
    return pieces


def subtract_all(interval: Interval, cuts: list[Interval]) -> list[Interval]:
    pieces = [interval]
    for cut in cuts:
        next_pieces: list[Interval] = []
        for piece in pieces:
            next_pieces.extend(subtract_one(piece, cut))
        pieces = next_pieces
    return [piece for piece in pieces if piece[1] > piece[0]]
