# StreamPulse Ingestion Benchmark Methodology

## Objective
Measure the sustained ingestion throughput, schema validation overhead, and end-to-end latency of the StreamPulse backend under realistic telemetry workloads.

## Test Environment
- **Platform**: Apple Silicon ARM64 (macOS)
- **Runtime**: Node.js v26.13.1
- **HTTP Framework**: Fastify v5.2.1
- **Database**: `node:sqlite` (`DatabaseSync`) with Write-Ahead Logging (`PRAGMA journal_mode = WAL`) and synchronous normal (`PRAGMA synchronous = NORMAL`)
- **Schema Validator**: Ajv 2020-12 (pre-compiled against `spec/event-schema.v1.json`)

## Workload Generation
The benchmark leverages the deterministic synthetic session generator (`tools/simulator/generator.ts`) driven by a Mulberry32 PRNG seed (`1337`).
- **Batch Volume**: 1,000 distinct session envelopes
- **Event Volume**: 14,333 events (~14.3 events/batch)
- **Profile**: `mixed` profile simulating nominal playback (80%), high-bitrate drops (8%), rebuffers & seeks (7%), video start failures (2.6%), and app crashes (2.9%).
- **Concurrency**: 10 concurrent async ingestion workers

## Ingestion Pipeline Under Test
For every POST `/v1/batches` request, the server executes:
1. **HTTP Deserialization**: JSON parse and content-type verification.
2. **Schema Validation**: Ajv 2020 strict schema validation enforcing required fields, monotonic sequences, UUID formats, and bounded payload sizes.
3. **Batch Deduplication**: Idempotency check on `batch_id`.
4. **Event Ingestion**: Atomically inserting raw events into the `events` table with deduplication on `(session_id, seq)`.
5. **Rollup Computation**: On-the-fly incremental session metric rollup updating startup time, rebuffer count/duration, dropped frames, time-weighted bitrate, and composite QoE score.
6. **Clock Skew Header**: Injecting RFC-1123 `Date` header for client-side clock skew calibration.
