# StreamPulse Benchmark Results

Tested on: Apple Silicon ARM64, macOS, Node.js v26.13.1, Fastify v5.2.1, `node:sqlite` WAL mode.

## Ingestion Throughput & Latency

| Metric | Measured Value | Notes |
| :--- | :--- | :--- |
| **Total Batches Ingested** | 1,000 batches | 0 failures, 100% schema valid |
| **Total Events Ingested** | 14,333 events | ~14.3 events/batch |
| **Total Ingestion Time** | 0.301 seconds | Concurrency: 10 concurrent workers |
| **Batch Throughput** | **3,323.1 batches/sec** | End-to-end (JSON + Ajv + DB + Rollup) |
| **Event Throughput** | **47,630.5 events/sec** | Sustained raw event insertion |
| **Latency Min** | 1.97 ms | |
| **Latency p50** | **2.76 ms** | Median response latency |
| **Latency p90** | 3.64 ms | 90th percentile latency |
| **Latency p95** | **3.95 ms** | 95th percentile latency |
| **Latency p99** | 9.29 ms | 99th percentile tail latency |
| **Latency Max** | 13.20 ms | Maximum observed single-batch latency |

## Post-Ingest Query API Verification

The ingested dataset was immediately queried through `/v1/metrics/summary`:

| Metric | Value | Interpretation |
| :--- | :--- | :--- |
| **Total Sessions** | 1,000 | All 1,000 sessions cleanly indexed |
| **Average QoE Score** | 88.27 / 100 | Reflects mixed network distribution |
| **Startup Time p50** | 716 ms | 50% of sessions started in under 716ms |
| **Startup Time p95** | 2,475 ms | 95% of sessions started in under 2.48s |
| **Rebuffer Ratio** | 0.01235 (1.24%) | 1.24% of playback time spent stalled |
| **Crash-Free Sessions** | 97.10% | 29 sessions recorded crash/ANR correlation |
| **Video Start Failure (VSF)** | 2.60% | 26 sessions failed before first frame |
| **Exit Before Video Start (EBVS)** | 2.10% | 21 user exits before first frame |

## Performance Insights
1. **Schema Validation Cost**: Ajv 2020-12 compiles the canonical JSON schema to optimized V8 JS bytecode, requiring < 0.15 ms per batch of 20 events.
2. **SQLite WAL Mode**: Synchronous WAL transactions prevent write locks from starving reader queries, allowing dashboard polling while ingestion runs at > 45,000 events/second.
3. **Application-Level Rollups**: Computing session rollups at ingest time eliminates expensive window functions and table scans during dashboard queries.
