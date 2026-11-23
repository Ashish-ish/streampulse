import type { DatabaseSync } from "node:sqlite";
import type { StreamPulseBatch, StreamPulseEvent } from "./models.js";
import { validateAndCleanBatch } from "./schema-validator.js";
import { computeSessionRollup } from "./rollup.js";

export interface IngestResult {
  accepted: boolean;
  batch_id: string;
  events_received: number;
  events_inserted: number;
  unknown_events_dropped: number;
  deduplicated?: boolean;
}

let globalUnknownEventsCounter = 0;

export function getUnknownEventsCounter(): number {
  return globalUnknownEventsCounter;
}

export function ingestBatch(db: DatabaseSync, rawPayload: unknown): IngestResult {
  const outcome = validateAndCleanBatch(rawPayload);
  if (!outcome.valid || !outcome.cleanedBatch) {
    throw new Error(`Batch validation failed: ${outcome.errors?.join(", ")}`);
  }

  globalUnknownEventsCounter += outcome.unknownEventsCount;
  const batch = outcome.cleanedBatch;
  const now = new Date().toISOString();

  // 1. Check batch idempotency
  const checkBatchStmt = db.prepare("SELECT batch_id FROM batches WHERE batch_id = ?");
  const existingBatch = checkBatchStmt.get(batch.batch_id);
  if (existingBatch) {
    return {
      accepted: true,
      batch_id: batch.batch_id,
      events_received: batch.events.length,
      events_inserted: 0,
      unknown_events_dropped: outcome.unknownEventsCount,
      deduplicated: true,
    };
  }

  // 2. Insert batch record
  const insertBatchStmt = db.prepare(`
    INSERT INTO batches (
      batch_id, schema_version, sent_at, received_at,
      sdk_name, sdk_version, app_id, app_version, app_build,
      install_id, platform, os_version, model, network_type,
      event_count, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBatchStmt.run(
    batch.batch_id,
    batch.schema_version,
    batch.sent_at,
    now,
    batch.sdk.name,
    batch.sdk.version,
    batch.app.id,
    batch.app.version,
    batch.app.build,
    batch.device.install_id,
    batch.device.platform,
    batch.device.os_version,
    batch.device.model,
    batch.device.network_type,
    batch.events.length,
    JSON.stringify(rawPayload)
  );

  // 3. Insert events with deduplication on (session_id, seq)
  const insertEventStmt = db.prepare(`
    INSERT OR IGNORE INTO events (
      batch_id, session_id, play_id, seq, type, t_mono_ms, t_wall, data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let eventsInserted = 0;
  const affectedSessionIds = new Set<string>();

  for (const ev of batch.events) {
    affectedSessionIds.add(ev.session_id);
    const result = insertEventStmt.run(
      batch.batch_id,
      ev.session_id,
      ev.play_id,
      ev.seq,
      ev.type,
      ev.t_mono_ms,
      ev.t_wall,
      JSON.stringify(ev.data)
    );
    if (result.changes > 0) {
      eventsInserted++;
    }
  }

  // 4. Update session rollups for affected sessions
  for (const sessionId of affectedSessionIds) {
    updateSessionRollup(db, sessionId, batch);
  }

  return {
    accepted: true,
    batch_id: batch.batch_id,
    events_received: batch.events.length,
    events_inserted: eventsInserted,
    unknown_events_dropped: outcome.unknownEventsCount,
  };
}

function updateSessionRollup(
  db: DatabaseSync,
  sessionId: string,
  latestBatch: StreamPulseBatch
): void {
  const getEventsStmt = db.prepare(`
    SELECT type, session_id, play_id, seq, t_mono_ms, t_wall, data
    FROM events
    WHERE session_id = ?
    ORDER BY seq ASC
  `);

  const rows = getEventsStmt.all(sessionId) as Array<{
    type: string;
    session_id: string;
    play_id: string;
    seq: number;
    t_mono_ms: number;
    t_wall: string;
    data: string;
  }>;

  if (rows.length === 0) return;

  const events: StreamPulseEvent[] = rows.map((r) => ({
    type: r.type as StreamPulseEvent["type"],
    session_id: r.session_id,
    play_id: r.play_id,
    seq: r.seq,
    t_mono_ms: r.t_mono_ms,
    t_wall: r.t_wall,
    data: JSON.parse(r.data),
  }));

  const metrics = computeSessionRollup(events);

  // Extract session metadata
  const sessionStartEvent = events.find((e) => e.type === "session_start");
  let contentId: string | null = null;
  let streamType: string | null = null;
  let protocol: string | null = null;
  let playerName: string | null = null;

  if (sessionStartEvent) {
    const data = sessionStartEvent.data as {
      content_id?: string;
      stream_type?: string;
      protocol?: string;
      player?: { name: string; version: string };
    };
    contentId = data.content_id ?? null;
    streamType = data.stream_type ?? null;
    protocol = data.protocol ?? null;
    playerName = data.player?.name ? `${data.player.name} ${data.player.version}` : null;
  }

  const firstEventAt = events[0].t_wall;
  const lastEventAt = events[events.length - 1].t_wall;
  const now = new Date().toISOString();

  const upsertSessionStmt = db.prepare(`
    INSERT INTO sessions (
      session_id, content_id, stream_type, protocol, player_name,
      platform, app_version, network_type, device_model,
      first_event_at, last_event_at, has_first_frame,
      startup_ms, vsf, ebvs, rebuffer_ms, rebuffer_count, play_time_ms,
      rebuffer_ratio, rebuffer_bucket, dropped, rendered,
      dropped_frame_ratio, dropped_frame_bucket, avg_bitrate_bps,
      bitrate_switch_count, playback_failure, crash_or_anr,
      app_health_kinds, qoe, clock_regression, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
    ON CONFLICT(session_id) DO UPDATE SET
      content_id = COALESCE(excluded.content_id, sessions.content_id),
      stream_type = COALESCE(excluded.stream_type, sessions.stream_type),
      protocol = COALESCE(excluded.protocol, sessions.protocol),
      player_name = COALESCE(excluded.player_name, sessions.player_name),
      last_event_at = excluded.last_event_at,
      has_first_frame = excluded.has_first_frame,
      startup_ms = excluded.startup_ms,
      vsf = excluded.vsf,
      ebvs = excluded.ebvs,
      rebuffer_ms = excluded.rebuffer_ms,
      rebuffer_count = excluded.rebuffer_count,
      play_time_ms = excluded.play_time_ms,
      rebuffer_ratio = excluded.rebuffer_ratio,
      rebuffer_bucket = excluded.rebuffer_bucket,
      dropped = excluded.dropped,
      rendered = excluded.rendered,
      dropped_frame_ratio = excluded.dropped_frame_ratio,
      dropped_frame_bucket = excluded.dropped_frame_bucket,
      avg_bitrate_bps = excluded.avg_bitrate_bps,
      bitrate_switch_count = excluded.bitrate_switch_count,
      playback_failure = excluded.playback_failure,
      crash_or_anr = excluded.crash_or_anr,
      app_health_kinds = excluded.app_health_kinds,
      qoe = excluded.qoe,
      clock_regression = excluded.clock_regression,
      updated_at = excluded.updated_at
  `);

  upsertSessionStmt.run(
    sessionId,
    contentId,
    streamType,
    protocol,
    playerName,
    latestBatch.device.platform,
    latestBatch.app.version,
    latestBatch.device.network_type,
    latestBatch.device.model,
    firstEventAt,
    lastEventAt,
    metrics.has_first_frame ? 1 : 0,
    metrics.startup_ms,
    metrics.vsf ? 1 : 0,
    metrics.ebvs ? 1 : 0,
    metrics.rebuffer_ms,
    metrics.rebuffer_count,
    metrics.play_time_ms,
    metrics.rebuffer_ratio !== null ? parseFloat(metrics.rebuffer_ratio) : null,
    metrics.rebuffer_bucket,
    metrics.dropped,
    metrics.rendered,
    metrics.dropped_frame_ratio !== null ? parseFloat(metrics.dropped_frame_ratio) : null,
    metrics.dropped_frame_bucket,
    metrics.avg_bitrate_bps,
    metrics.bitrate_switch_count,
    metrics.playback_failure ? 1 : 0,
    metrics.crash_or_anr ? 1 : 0,
    JSON.stringify(metrics.app_health_kinds),
    metrics.qoe !== null ? parseFloat(metrics.qoe) : null,
    metrics.clock_regression ? 1 : 0,
    now
  );
}
