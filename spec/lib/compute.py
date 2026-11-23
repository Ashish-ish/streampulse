"""Deterministic per-session metric fold.

This module is the oracle for spec/fixtures. Kotlin and TypeScript ports must
match it. Durations use t_mono_ms only. seq is the logical order.

See docs/metrics.md.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from lib.intervals import clip, measure, subtract_all

CRASH_ANR_KINDS = frozenset({"crash", "anr", "native_crash"})
SESSION_SCOPED = frozenset({"session_start", "app_health"})

METRIC_KEYS = (
    "startup_ms",
    "vsf",
    "ebvs",
    "exit_before_start_other",
    "watch_ms",
    "seek_ms",
    "rebuffer_ms",
    "rebuffer_count",
    "play_time_ms",
    "rebuffer_ratio",
    "rebuffers_per_hour",
    "rebuffer_bucket",
    "dropped",
    "rendered",
    "dropped_frame_ratio",
    "dropped_frame_bucket",
    "avg_bitrate_bps",
    "bitrate_switch_count",
    "has_first_frame",
    "playback_failure",
    "app_health_kinds",
    "crash_or_anr",
    "qoe",
    "clock_regression",
    "seq_gaps",
)


def load_weights(raw: dict[str, Any]) -> dict[str, Any]:
    weights = {
        "startup": Decimal(raw["startup"]),
        "rebuffer": Decimal(raw["rebuffer"]),
        "dropped_frames": Decimal(raw["dropped_frames"]),
        "playback_failure": Decimal(raw["playback_failure"]),
        "startup_good_ms": int(raw["startup_good_ms"]),
        "startup_bad_ms": int(raw["startup_bad_ms"]),
        "rebuffer_ratio_bad": Decimal(raw["rebuffer_ratio_bad"]),
        "dropped_frame_ratio_bad": Decimal(raw["dropped_frame_ratio_bad"]),
    }
    total = (
        weights["startup"]
        + weights["rebuffer"]
        + weights["dropped_frames"]
        + weights["playback_failure"]
    )
    if total != Decimal("1"):
        raise ValueError(f"QoE weights must sum to 1, got {total}")
    if weights["startup_good_ms"] >= weights["startup_bad_ms"]:
        raise ValueError("startup_good_ms must be < startup_bad_ms")
    if weights["rebuffer_ratio_bad"] <= 0 or weights["dropped_frame_ratio_bad"] <= 0:
        raise ValueError("ratio penalties must be > 0")
    return weights


def ratio_bucket(ratio: Decimal | None) -> str | None:
    """Buckets: 0, (0, 1%], (1%, 3%], (3%, 10%], >10%."""
    if ratio is None:
        return None
    if ratio == 0:
        return "0"
    if ratio <= Decimal("0.01"):
        return "0-1%"
    if ratio <= Decimal("0.03"):
        return "1-3%"
    if ratio <= Decimal("0.10"):
        return "3-10%"
    return ">10%"


def percentile_linear(values: list[Decimal], percentile: Decimal) -> Decimal:
    """Hyndman-Fan type 7. `percentile` is in [0, 100]."""
    if not values:
        raise ValueError("percentile of an empty sample is undefined")
    if percentile < 0 or percentile > 100:
        raise ValueError("percentile must be between 0 and 100")
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = Decimal(len(ordered) - 1) * (percentile / Decimal(100))
    lower = int(position.to_integral_value(rounding="ROUND_FLOOR"))
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - Decimal(lower)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def session_metrics(events: list[dict[str, Any]], weights: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(weights.get("startup"), Decimal):
        weights = load_weights(weights)
    if not events:
        raise ValueError("session has no events")
    session_ids = {event["session_id"] for event in events}
    if len(session_ids) != 1:
        raise ValueError("session_metrics expects exactly one session_id")
    seqs = [event["seq"] for event in events]
    if len(seqs) != len(set(seqs)):
        raise ValueError("duplicate seq")
    ordered = sorted(events, key=lambda event: event["seq"])
    present = set(seqs)
    seq_gaps = len([index for index in range(ordered[-1]["seq"] + 1) if index not in present])

    comparable = [event for event in ordered if event["type"] != "app_health"]
    clock_regression = any(
        later["t_mono_ms"] < earlier["t_mono_ms"]
        for earlier, later in zip(comparable, comparable[1:])
    )

    attempts: dict[str, list[dict[str, Any]]] = {}
    attempt_order: list[str] = []
    health: list[str] = []
    for event in ordered:
        if event["type"] == "app_health":
            health.append(event["data"]["kind"])
            continue
        if event["type"] in SESSION_SCOPED:
            continue
        play_id = event["play_id"]
        if play_id not in attempts:
            attempts[play_id] = []
            attempt_order.append(play_id)
        attempts[play_id].append(event)

    folded = [_fold_attempt(attempts[play_id]) for play_id in attempt_order]
    has_play = any(item["play_requested"] for item in folded)
    has_first_frame = any(item["first_frame_seq"] is not None for item in folded)
    any_error = any(item["any_error"] for item in folded)
    any_fatal = any(item["any_fatal"] for item in folded)
    any_user_exit = any(item["user_exit"] for item in folded)

    startup = _startup(folded)
    if startup is not None and startup < 0:
        clock_regression = True
        startup = None

    first_frame_seq = min(
        (item["first_frame_seq"] for item in folded if item["first_frame_seq"] is not None),
        default=None,
    )
    playback_failure = has_first_frame and first_frame_seq is not None and any(
        seq > first_frame_seq for item in folded for seq in item["fatal_seqs"]
    )

    vsf = has_play and not has_first_frame and any_fatal
    ebvs = has_play and not has_first_frame and not any_error and any_user_exit
    exit_other = has_play and not has_first_frame and not vsf and not ebvs

    watch_ms = seek_ms = rebuffer_ms = rebuffer_count = play_time_ms = 0
    dropped = rendered = switches = 0
    bitrate_acc = 0
    bitrate_ms = 0
    for item in folded:
        dropped += item["dropped"]
        rendered += item["rendered"]
        if item["first_frame_seq"] is None or item["watch_ms"] is None:
            continue
        watch_ms += item["watch_ms"]
        seek_ms += item["seek_ms"]
        rebuffer_ms += item["rebuffer_ms"]
        rebuffer_count += item["rebuffer_count"]
        play_time_ms += item["play_time_ms"]
        switches += item["switches"]
        bitrate_acc += item["bitrate_acc"]
        bitrate_ms += item["bitrate_ms"]

    rebuffer_ratio = _ratio(rebuffer_ms, play_time_ms + rebuffer_ms)
    dropped_ratio = _ratio(dropped, dropped + rendered)
    per_hour = None
    if play_time_ms > 0:
        per_hour = Decimal(rebuffer_count) * Decimal(3_600_000) / Decimal(play_time_ms)
    avg_bitrate = None
    if bitrate_ms > 0:
        avg_bitrate = int(
            (Decimal(bitrate_acc) / Decimal(bitrate_ms)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )

    qoe = None
    if has_first_frame and startup is not None and not clock_regression:
        qoe = _qoe(startup, rebuffer_ratio, dropped_ratio, playback_failure, weights)

    return {
        "startup_ms": startup,
        "vsf": vsf,
        "ebvs": ebvs,
        "exit_before_start_other": exit_other,
        "watch_ms": watch_ms,
        "seek_ms": seek_ms,
        "rebuffer_ms": rebuffer_ms,
        "rebuffer_count": rebuffer_count,
        "play_time_ms": play_time_ms,
        "rebuffer_ratio": _fixed(rebuffer_ratio, 6),
        "rebuffers_per_hour": _fixed(per_hour, 4),
        "rebuffer_bucket": ratio_bucket(rebuffer_ratio),
        "dropped": dropped,
        "rendered": rendered,
        "dropped_frame_ratio": _fixed(dropped_ratio, 6),
        "dropped_frame_bucket": ratio_bucket(dropped_ratio),
        "avg_bitrate_bps": avg_bitrate,
        "bitrate_switch_count": switches,
        "has_first_frame": has_first_frame,
        "playback_failure": playback_failure,
        "app_health_kinds": health,
        "crash_or_anr": any(kind in CRASH_ANR_KINDS for kind in health),
        "qoe": _fixed(qoe, 2),
        "clock_regression": clock_regression,
        "seq_gaps": seq_gaps,
    }


def _fold_attempt(events: list[dict[str, Any]]) -> dict[str, Any]:
    end_at = next((index for index, event in enumerate(events) if event["type"] == "playback_end"), None)
    considered = events if end_at is None else events[: end_at + 1]

    play_requested_at: int | None = None
    play_requested_seq: int | None = None
    first_frame_at: int | None = None
    first_frame_seq: int | None = None
    end_at_ms: int | None = None
    user_exit = False
    any_error = False
    any_fatal = False
    fatal_seqs: list[int] = []
    buffers: list[tuple[int, int]] = []
    seeks: list[tuple[int, int]] = []
    open_buffer: int | None = None
    open_seek: int | None = None
    qualities: list[tuple[int, int]] = []
    dropped = 0
    rendered = 0

    for event in considered:
        kind = event["type"]
        at = event["t_mono_ms"]
        if kind == "play_requested" and play_requested_at is None:
            play_requested_at = at
            play_requested_seq = event["seq"]
        elif kind == "first_frame" and first_frame_at is None:
            first_frame_at = at
            first_frame_seq = event["seq"]
        elif kind == "buffering_start" and open_buffer is None:
            open_buffer = at
        elif kind == "buffering_end" and open_buffer is not None:
            if at >= open_buffer:
                buffers.append((open_buffer, at))
            open_buffer = None
        elif kind == "seek_start" and open_seek is None:
            open_seek = at
        elif kind == "seek_end" and open_seek is not None:
            if at >= open_seek:
                seeks.append((open_seek, at))
            open_seek = None
        elif kind == "quality_change":
            qualities.append((at, int(event["data"]["bitrate_bps"])))
        elif kind == "dropped_frames":
            dropped += int(event["data"]["dropped"])
            rendered += int(event["data"]["rendered"])
        elif kind == "playback_error":
            any_error = True
            if event["data"]["fatal"]:
                any_fatal = True
                fatal_seqs.append(event["seq"])
        elif kind == "playback_end":
            end_at_ms = at
            user_exit = event["data"]["reason"] == "user_exit"

    result: dict[str, Any] = {
        "play_requested": play_requested_at is not None,
        "play_requested_at": play_requested_at,
        "play_requested_seq": play_requested_seq,
        "first_frame_seq": first_frame_seq,
        "first_frame_at": first_frame_at,
        "user_exit": user_exit,
        "any_error": any_error,
        "any_fatal": any_fatal,
        "fatal_seqs": fatal_seqs,
        "dropped": dropped,
        "rendered": rendered,
        "watch_ms": None,
        "seek_ms": 0,
        "rebuffer_ms": 0,
        "rebuffer_count": 0,
        "play_time_ms": 0,
        "switches": 0,
        "bitrate_acc": 0,
        "bitrate_ms": 0,
    }
    if first_frame_at is None:
        return result

    timeline_end = end_at_ms if end_at_ms is not None else considered[-1]["t_mono_ms"]
    if timeline_end < first_frame_at:
        return result
    if open_buffer is not None and timeline_end >= open_buffer:
        buffers.append((open_buffer, timeline_end))
    if open_seek is not None and timeline_end >= open_seek:
        seeks.append((open_seek, timeline_end))

    watch = timeline_end - first_frame_at
    clipped_buffers = clip(buffers, first_frame_at, timeline_end)
    clipped_seeks = clip(seeks, first_frame_at, timeline_end)
    rebuffer_count = 0
    rebuffer_pieces: list[tuple[int, int]] = []
    for interval in clipped_buffers:
        pieces = subtract_all(interval, clipped_seeks)
        if measure(pieces) > 0:
            rebuffer_count += 1
            rebuffer_pieces.extend(pieces)
    rebuffer = measure(rebuffer_pieces)
    seek = measure(clipped_seeks)
    play = watch - seek - rebuffer
    if play < 0:
        raise ValueError("negative play time; interval math is inconsistent")

    switches, bitrate_acc, bitrate_ms = _bitrate(qualities, first_frame_at, timeline_end)
    result.update(
        {
            "watch_ms": watch,
            "seek_ms": seek,
            "rebuffer_ms": rebuffer,
            "rebuffer_count": rebuffer_count,
            "play_time_ms": play,
            "switches": switches,
            "bitrate_acc": bitrate_acc,
            "bitrate_ms": bitrate_ms,
        }
    )
    return result


def _bitrate(qualities: list[tuple[int, int]], start: int, end: int) -> tuple[int, int, int]:
    initial = [bitrate for at, bitrate in qualities if at <= start]
    current = initial[-1] if initial else None
    switches = 0
    cursor = start
    accumulated = 0
    accumulated_ms = 0
    for at, bitrate in qualities:
        if at <= start or at > end:
            continue
        if current is not None and at > cursor:
            accumulated += current * (at - cursor)
            accumulated_ms += at - cursor
        if current is None:
            current = bitrate
        else:
            switches += 1
            current = bitrate
        cursor = at
    if current is not None and end > cursor:
        accumulated += current * (end - cursor)
        accumulated_ms += end - cursor
    return switches, accumulated, accumulated_ms


def _startup(attempts: list[dict[str, Any]]) -> int | None:
    successful = [
        item
        for item in attempts
        if item["play_requested_at"] is not None and item["first_frame_at"] is not None
    ]
    if not successful:
        return None
    chosen = min(successful, key=lambda item: (item["play_requested_at"], item["play_requested_seq"]))
    return chosen["first_frame_at"] - chosen["play_requested_at"]


def _ratio(numerator: int, denominator: int) -> Decimal | None:
    if denominator <= 0:
        return None
    return Decimal(numerator) / Decimal(denominator)


def _qoe(
    startup_ms: int,
    rebuffer_ratio: Decimal | None,
    dropped_ratio: Decimal | None,
    playback_failure: bool,
    weights: dict[str, Any],
) -> Decimal:
    startup_score = _startup_score(startup_ms, weights)
    rebuffer_score = _penalty_score(rebuffer_ratio, weights["rebuffer_ratio_bad"])
    dropped_score = _penalty_score(dropped_ratio, weights["dropped_frame_ratio_bad"])
    failure_score = Decimal(0) if playback_failure else Decimal(100)
    return (
        weights["startup"] * startup_score
        + weights["rebuffer"] * rebuffer_score
        + weights["dropped_frames"] * dropped_score
        + weights["playback_failure"] * failure_score
    )


def _startup_score(startup_ms: int, weights: dict[str, Any]) -> Decimal:
    good = weights["startup_good_ms"]
    bad = weights["startup_bad_ms"]
    if startup_ms <= good:
        return Decimal(100)
    if startup_ms >= bad:
        return Decimal(0)
    return Decimal(100) * Decimal(bad - startup_ms) / Decimal(bad - good)


def _penalty_score(ratio: Decimal | None, bad: Decimal) -> Decimal:
    if ratio is None:
        return Decimal(100)
    penalty = min(Decimal(1), ratio / bad)
    return Decimal(100) * (Decimal(1) - penalty)


def _fixed(value: Decimal | None, places: int) -> str | None:
    if value is None:
        return None
    quantum = Decimal(1).scaleb(-places)
    rounded = value.quantize(quantum, rounding=ROUND_HALF_UP)
    return f"{rounded:.{places}f}"
