import type { DatabaseSync } from "node:sqlite";
import { percentileLinear } from "./rollup.js";

export interface FilterParams {
  from?: string;
  to?: string;
  platform?: string;
  app_version?: string;
  device_model?: string;
  network_type?: string;
}

type SqlParam = string | number | bigint | null;

function buildWhereClause(filters: FilterParams, prefix = ""): { sql: string; params: SqlParam[] } {
  const conditions: string[] = [];
  const params: SqlParam[] = [];

  const col = (name: string) => (prefix ? `${prefix}.${name}` : name);

  if (filters.from) {
    conditions.push(`${col("first_event_at")} >= ?`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`${col("first_event_at")} <= ?`);
    params.push(filters.to);
  }
  if (filters.platform && filters.platform !== "all") {
    conditions.push(`${col("platform")} = ?`);
    params.push(filters.platform);
  }
  if (filters.app_version && filters.app_version !== "all") {
    conditions.push(`${col("app_version")} = ?`);
    params.push(filters.app_version);
  }
  if (filters.device_model && filters.device_model !== "all") {
    conditions.push(`${col("device_model")} = ?`);
    params.push(filters.device_model);
  }
  if (filters.network_type && filters.network_type !== "all") {
    conditions.push(`${col("network_type")} = ?`);
    params.push(filters.network_type);
  }

  const sql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql, params };
}

export function getMetricsSummary(db: DatabaseSync, filters: FilterParams = {}) {
  const { sql: whereClause, params } = buildWhereClause(filters);

  // 1. Aggregates from sessions table
  const query = `
    SELECT
      COUNT(*) AS total_sessions,
      SUM(CASE WHEN has_first_frame = 1 THEN 1 ELSE 0 END) AS sessions_with_first_frame,
      SUM(vsf) AS vsf_count,
      SUM(ebvs) AS ebvs_count,
      AVG(rebuffer_ratio) AS avg_rebuffer_ratio,
      AVG(dropped_frame_ratio) AS avg_dropped_frame_ratio,
      SUM(crash_or_anr) AS crash_count,
      AVG(qoe) AS avg_qoe
    FROM sessions
    ${whereClause}
  `;

  const aggStmt = db.prepare(query);
  const row = (aggStmt.get(...params) as Record<string, unknown>) || {};

  const totalSessions = Number(row.total_sessions || 0);
  const withFirstFrame = Number(row.sessions_with_first_frame || 0);
  const vsfCount = Number(row.vsf_count || 0);
  const ebvsCount = Number(row.ebvs_count || 0);
  const crashCount = Number(row.crash_count || 0);

  // 2. Fetch startup values for Hyndman-Fan type 7 percentile calculation
  const startupQuery = `
    SELECT startup_ms
    FROM sessions
    ${whereClause ? whereClause + " AND" : "WHERE"} startup_ms IS NOT NULL
    ORDER BY startup_ms ASC
  `;
  const startupStmt = db.prepare(startupQuery);
  const startupRows = startupStmt.all(...params) as Array<{ startup_ms: number }>;
  const startupValues = startupRows.map((r) => r.startup_ms);

  const startupP50 = startupValues.length > 0 ? Math.round(percentileLinear(startupValues, 50)) : null;
  const startupP90 = startupValues.length > 0 ? Math.round(percentileLinear(startupValues, 90)) : null;
  const startupP95 = startupValues.length > 0 ? Math.round(percentileLinear(startupValues, 95)) : null;

  const vsfRate = totalSessions > 0 ? (vsfCount / totalSessions) * 100 : 0;
  const ebvsRate = totalSessions > 0 ? (ebvsCount / totalSessions) * 100 : 0;
  const crashFreeRate = totalSessions > 0 ? ((totalSessions - crashCount) / totalSessions) * 100 : 100;

  return {
    total_sessions: totalSessions,
    sessions_with_first_frame: withFirstFrame,
    startup_p50_ms: startupP50,
    startup_p90_ms: startupP90,
    startup_p95_ms: startupP95,
    rebuffer_ratio: row.avg_rebuffer_ratio !== null ? Number(row.avg_rebuffer_ratio) : 0,
    vsf_rate: Number(vsfRate.toFixed(2)),
    ebvs_rate: Number(ebvsRate.toFixed(2)),
    dropped_frame_ratio: row.avg_dropped_frame_ratio !== null ? Number(row.avg_dropped_frame_ratio) : 0,
    crash_free_sessions_rate: Number(crashFreeRate.toFixed(2)),
    avg_qoe: row.avg_qoe !== null ? Number(Number(row.avg_qoe).toFixed(2)) : null,
  };
}

export function getCorrelationMetrics(
  db: DatabaseSync,
  dimension: "rebuffer" | "dropped_frame" = "rebuffer",
  filters: FilterParams = {}
) {
  const { sql: whereClause, params } = buildWhereClause(filters);
  const bucketCol = dimension === "rebuffer" ? "rebuffer_bucket" : "dropped_frame_bucket";

  const standardBuckets = ["0", "0-1%", "1-3%", "3-10%", ">10%"];

  const query = `
    SELECT
      ${bucketCol} AS bucket,
      COUNT(*) AS session_count,
      SUM(crash_or_anr) AS crash_count
    FROM sessions
    ${whereClause ? whereClause + ` AND ${bucketCol} IS NOT NULL` : `WHERE ${bucketCol} IS NOT NULL`}
    GROUP BY ${bucketCol}
  `;

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Array<{
    bucket: string;
    session_count: number;
    crash_count: number;
  }>;

  const rowMap = new Map(rows.map((r) => [r.bucket, r]));

  return standardBuckets.map((bucket) => {
    const found = rowMap.get(bucket);
    const sessionCount = found ? Number(found.session_count) : 0;
    const crashCount = found ? Number(found.crash_count) : 0;
    const crashRate = sessionCount > 0 ? (crashCount / sessionCount) * 100 : 0;

    return {
      bucket,
      session_count: sessionCount,
      crash_count: crashCount,
      crash_rate: Number(crashRate.toFixed(2)),
    };
  });
}

export function getTimeseriesMetrics(
  db: DatabaseSync,
  metric: string,
  breakdown = "none",
  filters: FilterParams = {}
) {
  const { sql: whereClause, params } = buildWhereClause(filters);

  const breakdownCol =
    breakdown === "platform"
      ? "platform"
      : breakdown === "app_version"
      ? "app_version"
      : breakdown === "network_type"
      ? "network_type"
      : null;

  // Bucket by hour (using SQLite strftime on ISO timestamp)
  const groupCols = breakdownCol
    ? `strftime('%Y-%m-%dT%H:00:00.000Z', first_event_at), ${breakdownCol}`
    : `strftime('%Y-%m-%dT%H:00:00.000Z', first_event_at)`;

  const selectBreakdown = breakdownCol ? `${breakdownCol} AS breakdown_key,` : ``;

  const query = `
    SELECT
      strftime('%Y-%m-%dT%H:00:00.000Z', first_event_at) AS time_bucket,
      ${selectBreakdown}
      COUNT(*) AS session_count,
      AVG(startup_ms) AS avg_startup,
      AVG(rebuffer_ratio) AS avg_rebuffer_ratio,
      AVG(dropped_frame_ratio) AS avg_dropped_ratio,
      AVG(qoe) AS avg_qoe,
      SUM(vsf) * 100.0 / COUNT(*) AS vsf_rate,
      (COUNT(*) - SUM(crash_or_anr)) * 100.0 / COUNT(*) AS crash_free_rate
    FROM sessions
    ${whereClause}
    GROUP BY ${groupCols}
    ORDER BY time_bucket ASC
  `;

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    time: r.time_bucket as string,
    breakdown: (r.breakdown_key as string) ?? "overall",
    session_count: Number(r.session_count || 0),
    avg_startup_ms: r.avg_startup !== null ? Math.round(Number(r.avg_startup)) : null,
    avg_rebuffer_ratio: r.avg_rebuffer_ratio !== null ? Number(Number(r.avg_rebuffer_ratio).toFixed(4)) : null,
    avg_dropped_ratio: r.avg_dropped_ratio !== null ? Number(Number(r.avg_dropped_ratio).toFixed(4)) : null,
    avg_qoe: r.avg_qoe !== null ? Number(Number(r.avg_qoe).toFixed(2)) : null,
    vsf_rate: r.vsf_rate !== null ? Number(Number(r.vsf_rate).toFixed(2)) : 0,
    crash_free_rate: r.crash_free_rate !== null ? Number(Number(r.crash_free_rate).toFixed(2)) : 100,
  }));
}

export function listSessions(
  db: DatabaseSync,
  options: {
    limit?: number;
    offset?: number;
    sort?: "worst_qoe" | "worst_rebuffer" | "recent";
    filters?: FilterParams;
  } = {}
) {
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  const { sql: whereClause, params } = buildWhereClause(options.filters ?? {});

  let orderClause = "ORDER BY first_event_at DESC";
  if (options.sort === "worst_qoe") {
    orderClause = "ORDER BY qoe ASC, first_event_at DESC";
  } else if (options.sort === "worst_rebuffer") {
    orderClause = "ORDER BY rebuffer_ratio DESC, first_event_at DESC";
  }

  const query = `
    SELECT
      session_id, content_id, stream_type, protocol, player_name,
      platform, app_version, network_type, device_model,
      first_event_at, last_event_at, has_first_frame,
      startup_ms, vsf, ebvs, rebuffer_ms, rebuffer_count, play_time_ms,
      rebuffer_ratio, dropped, rendered, dropped_frame_ratio,
      avg_bitrate_bps, bitrate_switch_count, playback_failure,
      crash_or_anr, qoe
    FROM sessions
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  const stmt = db.prepare(query);
  const rows = stmt.all(...params, limit, offset);

  const countQuery = `SELECT COUNT(*) AS total FROM sessions ${whereClause}`;
  const countStmt = db.prepare(countQuery);
  const countRow = countStmt.get(...params) as { total: number };

  return {
    total: Number(countRow.total || 0),
    sessions: rows,
  };
}

export function getSessionDetail(db: DatabaseSync, sessionId: string) {
  const sessionStmt = db.prepare("SELECT * FROM sessions WHERE session_id = ?");
  const session = sessionStmt.get(sessionId) as Record<string, unknown> | undefined;

  if (!session) return null;

  const eventsStmt = db.prepare(`
    SELECT seq, type, t_mono_ms, t_wall, data
    FROM events
    WHERE session_id = ?
    ORDER BY seq ASC
  `);

  const eventRows = eventsStmt.all(sessionId) as Array<{
    seq: number;
    type: string;
    t_mono_ms: number;
    t_wall: string;
    data: string;
  }>;

  // Compute waterfall timing relative to first_frame or play_requested
  const firstFrameEvent = eventRows.find((e) => e.type === "first_frame");
  const playReqEvent = eventRows.find((e) => e.type === "play_requested");
  const anchorTime = firstFrameEvent?.t_mono_ms ?? playReqEvent?.t_mono_ms ?? eventRows[0]?.t_mono_ms ?? 0;

  const waterfall = eventRows.map((e) => ({
    seq: e.seq,
    type: e.type,
    t_mono_ms: e.t_mono_ms,
    t_wall: e.t_wall,
    t_rel_ms: e.t_mono_ms - anchorTime,
    data: JSON.parse(e.data),
  }));

  return {
    session,
    waterfall,
  };
}
