#!/usr/bin/env python3
"""Generate golden fixtures using the spec/lib/compute.py oracle."""

import json
from decimal import Decimal
from pathlib import Path
import sys

SPEC_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SPEC_DIR))

from lib.compute import session_metrics, load_weights

FIXTURES_DIR = SPEC_DIR / "fixtures"
FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

with open(SPEC_DIR / "qoe-weights.v1.json") as f:
    RAW_WEIGHTS = json.load(f)
WEIGHTS = load_weights(RAW_WEIGHTS)

BATCH_BASE = {
    "schema_version": "1.0",
    "batch_id": "a0000000-0000-4000-8000-000000000001",
    "sent_at": "2026-11-23T12:00:30.000Z",
    "sdk": {
        "name": "streampulse-android",
        "version": "0.1.0"
    },
    "app": {
        "id": "dev.streampulse.sample",
        "version": "1.0.0",
        "build": "42"
    },
    "device": {
        "install_id": "d0000000-0000-4000-8000-000000000001",
        "platform": "android",
        "os_version": "14",
        "model": "Pixel 8",
        "network_type": "wifi"
    }
}

def make_event(session_id: str, play_id: str, seq: int, ev_type: str, t_mono_ms: int, data: dict, t_wall: str = "2026-11-23T12:00:00.000Z") -> dict:
    return {
        "type": ev_type,
        "session_id": session_id,
        "play_id": play_id,
        "seq": seq,
        "t_mono_ms": t_mono_ms,
        "t_wall": t_wall,
        "data": data
    }

def create_fixtures():
    definitions = [
        # 1. Nominal Playback
        {
            "filename": "golden-nominal-playback.json",
            "id": "nominal-playback",
            "name": "Nominal Playback",
            "description": "Clean, smooth playback with startup under 1s, zero rebuffers, and clean exit.",
            "builder": lambda sid, pid: [
                make_event(sid, pid, 0, "session_start", 0, {
                    "content_id": "video-101",
                    "content_id_hashed": False,
                    "stream_type": "vod",
                    "protocol": "hls",
                    "player": {"name": "ExoPlayer", "version": "1.4.0"},
                    "cdn": "fastly"
                }),
                make_event(sid, pid, 1, "play_requested", 100, {}),
                make_event(sid, pid, 2, "quality_change", 150, {
                    "bitrate_bps": 2500000,
                    "width": 1920,
                    "height": 1080
                }),
                make_event(sid, pid, 3, "first_frame", 600, {}),
                make_event(sid, pid, 4, "heartbeat", 10600, {
                    "position_ms": 10000,
                    "buffered_ms": 15000,
                    "dropped_total": 0,
                    "rendered_total": 600
                }),
                make_event(sid, pid, 5, "playback_end", 20600, {
                    "reason": "ended"
                })
            ]
        },
        # 2. Rebuffer and Seek
        {
            "filename": "golden-rebuffer-and-seek.json",
            "id": "rebuffer-and-seek",
            "name": "Rebuffer Overlapping Seek",
            "description": "Tests interval arithmetic where seek overlaps buffering, ensuring seek time is deducted from rebuffering.",
            "builder": lambda sid, pid: [
                make_event(sid, pid, 0, "session_start", 0, {
                    "content_id": "video-102",
                    "content_id_hashed": False,
                    "stream_type": "vod",
                    "protocol": "hls",
                    "player": {"name": "ExoPlayer", "version": "1.4.0"}
                }),
                make_event(sid, pid, 1, "play_requested", 100, {}),
                make_event(sid, pid, 2, "first_frame", 800, {}),
                make_event(sid, pid, 3, "buffering_start", 2000, {}),
                make_event(sid, pid, 4, "seek_start", 2500, {
                    "from_ms": 1500,
                    "to_ms": 10000
                }),
                make_event(sid, pid, 5, "buffering_end", 3500, {}),
                make_event(sid, pid, 6, "seek_end", 4000, {}),
                make_event(sid, pid, 7, "playback_end", 10800, {
                    "reason": "ended"
                })
            ]
        },
        # 3. Video Start Failure (VSF)
        {
            "filename": "golden-video-start-failure.json",
            "id": "video-start-failure",
            "name": "Video Start Failure (VSF)",
            "description": "Fatal error encountered after play_requested and before first_frame.",
            "builder": lambda sid, pid: [
                make_event(sid, pid, 0, "session_start", 0, {
                    "content_id": "video-103",
                    "content_id_hashed": False,
                    "stream_type": "vod",
                    "protocol": "hls",
                    "player": {"name": "ExoPlayer", "version": "1.4.0"}
                }),
                make_event(sid, pid, 1, "play_requested", 100, {}),
                make_event(sid, pid, 2, "buffering_start", 200, {}),
                make_event(sid, pid, 3, "playback_error", 1200, {
                    "code": "MANIFEST_404",
                    "fatal": True,
                    "message": "Failed to load manifest"
                }),
                make_event(sid, pid, 4, "playback_end", 1250, {
                    "reason": "error"
                })
            ]
        },
        # 4. Exit Before Video Start (EBVS)
        {
            "filename": "golden-exit-before-start.json",
            "id": "exit-before-start",
            "name": "Exit Before Video Start (EBVS)",
            "description": "User abandons playback before first_frame without experiencing an error.",
            "builder": lambda sid, pid: [
                make_event(sid, pid, 0, "session_start", 0, {
                    "content_id": "video-104",
                    "content_id_hashed": False,
                    "stream_type": "vod",
                    "protocol": "hls",
                    "player": {"name": "ExoPlayer", "version": "1.4.0"}
                }),
                make_event(sid, pid, 1, "play_requested", 100, {}),
                make_event(sid, pid, 2, "buffering_start", 200, {}),
                make_event(sid, pid, 3, "playback_end", 800, {
                    "reason": "user_exit"
                })
            ]
        },
        # 5. Dropped Frames and Bitrate Changes
        {
            "filename": "golden-dropped-frames-and-bitrate.json",
            "id": "dropped-frames-and-bitrate",
            "name": "Dropped Frames and Bitrate Changes",
            "description": "Tests time-weighted bitrate calculation and cumulative dropped frame ratio.",
            "builder": lambda sid, pid: [
                make_event(sid, pid, 0, "session_start", 0, {
                    "content_id": "video-105",
                    "content_id_hashed": False,
                    "stream_type": "vod",
                    "protocol": "hls",
                    "player": {"name": "ExoPlayer", "version": "1.4.0"}
                }),
                make_event(sid, pid, 1, "play_requested", 100, {}),
                make_event(sid, pid, 2, "quality_change", 200, {
                    "bitrate_bps": 1000000,
                    "width": 1280,
                    "height": 720
                }),
                make_event(sid, pid, 3, "first_frame", 600, {}),
                make_event(sid, pid, 4, "quality_change", 3600, {
                    "bitrate_bps": 2000000,
                    "width": 1920,
                    "height": 1080
                }),
                make_event(sid, pid, 5, "dropped_frames", 5000, {
                    "dropped": 15,
                    "rendered": 285
                }),
                make_event(sid, pid, 6, "quality_change", 6600, {
                    "bitrate_bps": 4000000,
                    "width": 2560,
                    "height": 1440
                }),
                make_event(sid, pid, 7, "dropped_frames", 10600, {
                    "dropped": 35,
                    "rendered": 565
                }),
                make_event(sid, pid, 8, "playback_end", 10600, {
                    "reason": "ended"
                })
            ]
        },
        # 6. Crash & ANR Correlation
        {
            "filename": "golden-crash-and-anr.json",
            "id": "crash-and-anr",
            "name": "App Health ANR Correlation",
            "description": "Session accompanied by an app_health event correlating playback state with an ANR.",
            "builder": lambda sid, pid: [
                make_event(sid, pid, 0, "session_start", 0, {
                    "content_id": "video-106",
                    "content_id_hashed": False,
                    "stream_type": "vod",
                    "protocol": "hls",
                    "player": {"name": "ExoPlayer", "version": "1.4.0"}
                }),
                make_event(sid, pid, 1, "play_requested", 100, {}),
                make_event(sid, pid, 2, "first_frame", 600, {}),
                make_event(sid, pid, 3, "buffering_start", 2000, {}),
                make_event(sid, pid, 4, "buffering_end", 3000, {}),
                make_event(sid, pid, 5, "heartbeat", 10600, {
                    "position_ms": 9000,
                    "buffered_ms": 12000,
                    "dropped_total": 0,
                    "rendered_total": 600
                }),
                make_event(sid, pid, 6, "app_health", 11000, {
                    "kind": "anr",
                    "occurred_at": "2026-11-23T12:00:11.000Z"
                })
            ]
        },
        # 7. Playback Failure Midstream
        {
            "filename": "golden-playback-failure-midstream.json",
            "id": "playback-failure-midstream",
            "name": "Midstream Playback Failure",
            "description": "Fatal playback error occurring after first_frame, marking playback_failure = true.",
            "builder": lambda sid, pid: [
                make_event(sid, pid, 0, "session_start", 0, {
                    "content_id": "video-107",
                    "content_id_hashed": False,
                    "stream_type": "vod",
                    "protocol": "hls",
                    "player": {"name": "ExoPlayer", "version": "1.4.0"}
                }),
                make_event(sid, pid, 1, "play_requested", 100, {}),
                make_event(sid, pid, 2, "first_frame", 500, {}),
                make_event(sid, pid, 3, "heartbeat", 10500, {
                    "position_ms": 10000,
                    "buffered_ms": 15000,
                    "dropped_total": 0,
                    "rendered_total": 600
                }),
                make_event(sid, pid, 4, "playback_error", 15000, {
                    "code": "DECODER_INIT_FAILED",
                    "fatal": True,
                    "message": "Hardware decoder initialization failed"
                }),
                make_event(sid, pid, 5, "playback_end", 15100, {
                    "reason": "error"
                })
            ]
        }
    ]

    for idx, d in enumerate(definitions, start=1):
        sid = f"e0000000-0000-4000-8000-{idx:012d}"
        pid = f"f0000000-0000-4000-8000-{idx:012d}"
        bid = f"b0000000-0000-4000-8000-{idx:012d}"
        
        events = d["builder"](sid, pid)
        batch = dict(BATCH_BASE)
        batch["batch_id"] = bid
        batch["events"] = events
        
        expected = session_metrics(events, WEIGHTS)
        fixture_obj = {
            "id": d["id"],
            "name": d["name"],
            "description": d["description"],
            "batch": batch,
            "expected": expected
        }
        
        filepath = FIXTURES_DIR / d["filename"]
        with open(filepath, "w") as f:
            json.dump(fixture_obj, f, indent=2)
        print(f"Generated {filepath.name} (session: {sid})")

if __name__ == "__main__":
    create_fixtures()
