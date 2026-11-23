# StreamPulse Telemetry Event Schema (v1.0)

The StreamPulse specification enforces strict schema governance. All telemetry batches ingested by the server or emitted by any client SDK must conform to `spec/event-schema.v1.json` (JSON Schema Draft 2020-12).

---

## 1. Batch Envelope Structure

Telemetry events are batched into gzip-compressed payloads adhering to the following envelope:

```json
{
  "schema_version": "1.0",
  "batch_id": "b0000000-0000-4000-8000-000000000001",
  "sent_at": "2026-11-23T12:00:30.000Z",
  "sdk": {
    "name": "streampulse-android",
    "version": "0.1.0"
  },
  "app": {
    "id": "com.example.app",
    "version": "1.2.3",
    "build": "45"
  },
  "device": {
    "install_id": "d0000000-0000-4000-8000-000000000001",
    "platform": "android",
    "os_version": "14",
    "model": "Pixel 8",
    "network_type": "wifi"
  },
  "events": [ ... ]
}
```

### Top-Level Fields
| Field | Type | Description |
|:---|:---|:---|
| `schema_version` | `"1.0"` | Constant string indicating envelope version. |
| `batch_id` | UUIDv4 | Unique identifier for the batch (used for idempotent ingestion). |
| `sent_at` | ISO-8601 UTC | Wall-clock timestamp when client dispatched the HTTP request. |
| `sdk` | Object | Name (`streampulse-android`, `ios`, `web`, `react-native`) and semver version. |
| `app` | Object | Application identifier, version string, and build number. |
| `device` | Object | Pseudonymous `install_id`, OS version, device model, and active network type. |
| `events` | Array[Event] | 1 to 500 events ordered logically by `seq`. |

---

## 2. Event Types & Payloads

Every event shares a common header:
```json
{
  "type": "string",
  "session_id": "UUIDv4",
  "play_id": "UUIDv4",
  "seq": 0,
  "t_mono_ms": 100,
  "t_wall": "2026-11-23T12:00:00.000Z",
  "data": { ... }
}
```

### Supported Event Types

| Event Type | Purpose | Specific Data Fields |
|:---|:---|:---|
| `session_start` | Initialization of stream playback session. | `content_id` (str), `content_id_hashed` (bool), `stream_type` (vod\|live), `protocol` (hls\|dash\|progressive), `player` (`name`, `version`), `cdn` (opt str) |
| `play_requested` | User requested playback (click play / autoplay trigger). | `{}` |
| `first_frame` | First video frame rendered to display. | `{}` |
| `buffering_start` | Player halted playback due to buffer starvation. | `{}` |
| `buffering_end` | Player resumed playback after buffering filled. | `{}` |
| `seek_start` | User initiated scrubber repositioning. | `from_ms` (int), `to_ms` (int) |
| `seek_end` | Scrubber repositioning completed. | `{}` |
| `quality_change` | Adaptive bitrate track switch. | `bitrate_bps` (int), `width` (int), `height` (int) |
| `dropped_frames` | Polled renderer frame performance delta. | `dropped` (int delta), `rendered` (int delta) |
| `playback_error` | Player pipeline error. | `code` (string), `fatal` (bool), `message` (scrubbed, $\le 200$ chars) |
| `heartbeat` | 10s periodic snapshot during playback. | `position_ms` (int), `buffered_ms` (int), `dropped_total` (int), `rendered_total` (int) |
| `playback_end` | Playback session termination. | `reason` (`ended` \| `user_exit` \| `error` \| `background`) |
| `app_health` | Correlated application lifecycle failure. | `kind` (`crash` \| `anr` \| `hang` \| `native_crash`), `occurred_at` (ISO timestamp) |

---

## 3. Ingestion & Invariant Rules

1. **Monotonic Sequence (`seq`)**:
   - Each session maintains an incrementing integer `seq` starting at 0.
   - Events within a batch are sorted by `seq`.
2. **Deduplication**:
   - Batches are deduplicated at the gateway on `batch_id`.
   - Events are deduplicated on `(session_id, seq)`.
3. **Unknown Event Types**:
   - Client SDKs reject unknown event types in debug builds to prevent regressions.
   - The ingest server strips unrecognized event types, increments an `unknown_events_dropped` counter, and validates the remaining batch payload.
4. **Clock Regression**:
   - `t_mono_ms` must be non-decreasing within comparable session events (excluding `app_health`).
   - If backward monotonicity is detected, the session is flagged with `clock_regression = true` and startup calculation is invalidated.
