import type {
  FilterState,
  KpiSummary,
  CorrelationBucket,
  TimeseriesPoint,
  SessionRow,
  SessionDetail,
} from "./types.js";

function getFromTimestamp(range: FilterState["timeRange"]): string {
  const now = Date.now();
  const offsets: Record<FilterState["timeRange"], number> = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  return new Date(now - offsets[range]).toISOString();
}

function buildQuery(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("from", getFromTimestamp(filters.timeRange));
  if (filters.platform !== "all") params.set("platform", filters.platform);
  if (filters.appVersion !== "all") params.set("app_version", filters.appVersion);
  if (filters.networkType !== "all") params.set("network_type", filters.networkType);
  return params;
}

export async function fetchSummary(filters: FilterState): Promise<KpiSummary> {
  const q = buildQuery(filters);
  const res = await fetch(`/v1/metrics/summary?${q.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchCorrelation(
  filters: FilterState,
  dimension: "rebuffer" | "dropped_frame"
): Promise<CorrelationBucket[]> {
  const q = buildQuery(filters);
  q.set("dimension", dimension);
  const res = await fetch(`/v1/metrics/correlation?${q.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTimeseries(
  filters: FilterState,
  metric: string,
  breakdown: string
): Promise<TimeseriesPoint[]> {
  const q = buildQuery(filters);
  q.set("metric", metric);
  q.set("breakdown", breakdown);
  const res = await fetch(`/v1/metrics/timeseries?${q.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSessions(
  filters: FilterState,
  sort: "worst_qoe" | "worst_rebuffer" | "recent",
  limit = 25
): Promise<{ total: number; sessions: SessionRow[] }> {
  const q = buildQuery(filters);
  q.set("sort", sort);
  q.set("limit", limit.toString());
  const res = await fetch(`/v1/sessions?${q.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionDetail> {
  const res = await fetch(`/v1/sessions/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
