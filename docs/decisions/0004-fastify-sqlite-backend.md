# ADR 0004: Fastify and SQLite for Ingestion and Rollup Storage

## Context
The backend must be lightweight, portfolio-grade, easy to spin up locally with a single command, yet robust enough to handle high-throughput telemetry ingestion with zero complex infrastructure dependencies (no Kafka, ClickHouse, or Kubernetes).

## Decision
1. **Server Framework**: Fastify + TypeScript for high I/O performance and native JSON schema integration.
2. **Database**: SQLite via `better-sqlite3` configured in Write-Ahead Logging (WAL) mode.
3. **Data Pipeline**:
   - Ingest endpoint validates batches against the JSON schema with Ajv.
   - Raw batches and events are stored for auditability and session waterfall drill-down.
   - Per-session metrics are rolled up incrementally at ingest time into a `sessions` table.
   - Percentile metrics (p50/p90/p95) are calculated in application code using Hyndman-Fan type 7 linear interpolation.

## Consequences
- **Positive**: Single-command startup (`npm run dev`), zero external services, instant query response times on millions of events.
- **Negative**: Single-node architecture; horizontal scaling would require migrating SQLite to DuckDB or distributed ClickHouse in future non-portfolio versions.
