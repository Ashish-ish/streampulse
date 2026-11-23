// Generated automatically from spec/event-schema.v1.json. DO NOT EDIT BY HAND.

export type Platform = "android" | "ios" | "web" | "rn";
export type NetworkType = "wifi" | "cellular" | "ethernet" | "none" | "unknown";
export type StreamType = "vod" | "live";
export type Protocol = "hls" | "dash" | "progressive";
export type PlaybackEndReason = "ended" | "user_exit" | "error" | "background";
export type AppHealthKind = "crash" | "anr" | "hang" | "native_crash";

export interface SdkInfo {
  name: string;
  version: string;
}

export interface AppInfo {
  id: string;
  version: string;
  build: string;
}

export interface DeviceInfo {
  install_id: string;
  platform: Platform;
  os_version: string;
  model: string;
  network_type: NetworkType;
}

export interface PlayerInfo {
  name: string;
  version: string;
}

export interface SessionStartData {
  content_id: string;
  content_id_hashed: boolean;
  stream_type: StreamType;
  protocol: Protocol;
  player: PlayerInfo;
  cdn?: string;
}

export interface SeekStartData {
  from_ms: number;
  to_ms: number;
}

export interface QualityChangeData {
  bitrate_bps: number;
  width: number;
  height: number;
}

export interface DroppedFramesData {
  dropped: number;
  rendered: number;
}

export interface PlaybackErrorData {
  code: string;
  fatal: boolean;
  message: string;
}

export interface HeartbeatData {
  position_ms: number;
  buffered_ms: number;
  dropped_total: number;
  rendered_total: number;
}

export interface PlaybackEndData {
  reason: PlaybackEndReason;
}

export interface AppHealthData {
  kind: AppHealthKind;
  occurred_at: string;
}

export type EventData =
  | Record<string, never>
  | SessionStartData
  | SeekStartData
  | QualityChangeData
  | DroppedFramesData
  | PlaybackErrorData
  | HeartbeatData
  | PlaybackEndData
  | AppHealthData;

export type EventType =
  | "session_start"
  | "play_requested"
  | "first_frame"
  | "buffering_start"
  | "buffering_end"
  | "seek_start"
  | "seek_end"
  | "quality_change"
  | "dropped_frames"
  | "playback_error"
  | "heartbeat"
  | "playback_end"
  | "app_health";

export interface StreamPulseEvent {
  type: EventType;
  session_id: string;
  play_id: string;
  seq: number;
  t_mono_ms: number;
  t_wall: string;
  data: EventData;
}

export interface StreamPulseBatch {
  schema_version: "1.0";
  batch_id: string;
  sent_at: string;
  sdk: SdkInfo;
  app: AppInfo;
  device: DeviceInfo;
  events: StreamPulseEvent[];
}

export const SDK_DEFAULTS = {
  "id": "streampulse.sdk-defaults.v1",
  "flush_event_count": 20,
  "flush_interval_ms": 15000,
  "max_batch_size": 20,
  "max_queue_events": 5000,
  "max_queue_bytes": 5000000,
  "retry_base_ms": 2000,
  "retry_cap_ms": 300000,
  "retry_after_max_ms": 900000,
  "retry_jitter_ratio": "0.20",
  "heartbeat_interval_ms": 10000,
  "error_message_max_chars": 200,
  "default_sample_rate": "1.0",
  "critical_event_types": [
    "app_health",
    "playback_end"
  ]
} as const;

export const QOE_WEIGHTS = {
  "id": "streampulse.qoe-weights.v1",
  "startup": "0.30",
  "rebuffer": "0.35",
  "dropped_frames": "0.15",
  "playback_failure": "0.20",
  "startup_good_ms": 1000,
  "startup_bad_ms": 5000,
  "rebuffer_ratio_bad": "0.10",
  "dropped_frame_ratio_bad": "0.05"
} as const;
