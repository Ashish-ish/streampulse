export interface FilterState {
  timeRange: "1h" | "6h" | "24h" | "7d";
  platform: string;
  appVersion: string;
  networkType: string;
}

export interface KpiSummary {
  total_sessions: number;
  sessions_with_first_frame: number;
  startup_p50_ms: number | null;
  startup_p90_ms: number | null;
  startup_p95_ms: number | null;
  rebuffer_ratio: number;
  vsf_rate: number;
  ebvs_rate: number;
  dropped_frame_ratio: number;
  crash_free_sessions_rate: number;
  avg_qoe: number | null;
}

export interface CorrelationBucket {
  bucket: string;
  session_count: number;
  crash_count: number;
  crash_rate: number;
}

export interface TimeseriesPoint {
  time: string;
  breakdown: string;
  session_count: number;
  avg_startup_ms: number | null;
  avg_rebuffer_ratio: number | null;
  avg_dropped_ratio: number | null;
  avg_qoe: number | null;
  vsf_rate: number;
  crash_free_rate: number;
}

export interface SessionRow {
  session_id: string;
  content_id: string | null;
  stream_type: string | null;
  protocol: string | null;
  player_name: string | null;
  platform: string;
  app_version: string;
  network_type: string;
  device_model: string;
  first_event_at: string;
  last_event_at: string;
  has_first_frame: number;
  startup_ms: number | null;
  vsf: number;
  ebvs: number;
  rebuffer_ms: number;
  rebuffer_count: number;
  play_time_ms: number;
  rebuffer_ratio: number | null;
  dropped: number;
  rendered: number;
  dropped_frame_ratio: number | null;
  avg_bitrate_bps: number | null;
  bitrate_switch_count: number;
  playback_failure: number;
  crash_or_anr: number;
  qoe: number | null;
}

export interface WaterfallEvent {
  seq: number;
  type: string;
  t_mono_ms: number;
  t_wall: string;
  t_rel_ms: number;
  data: Record<string, unknown>;
}

export interface SessionDetail {
  session: SessionRow;
  waterfall: WaterfallEvent[];
}
