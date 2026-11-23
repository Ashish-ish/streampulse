# StreamPulse Autonomous Agent Guidelines

This file guides autonomous AI agents working within the StreamPulse repository.

## Non-Negotiable Tenets

1. **Schema-First Governance**:
   - `spec/event-schema.v1.json` is the sole source of truth for the event schema and batch contracts.
   - Do not edit generated models by hand. Run `make generate` and verify with `make check`.

2. **Metric Parity**:
   - All SDKs (Kotlin KMP, Web TypeScript, iOS Swift) and the Fastify backend rollup must match the Python oracle in `spec/lib/compute.py`.
   - Never alter a metric definition without updating `spec/lib/compute.py`, re-generating `spec/fixtures/`, and running tests across all target implementations.

3. **Verification Before Progression**:
   - Never move to the next implementation phase until all acceptance criteria of the current phase pass cleanly.
   - Run tests (`make check`, unit tests, integration tests) to ensure zero regressions.

4. **Honest Benchmarks**:
   - Never fabricate or guess performance benchmarks. Run the benchmark harnesses in `bench/` on real hardware/runtimes.

5. **Decision Tracking**:
   - Document any architectural decisions or trade-offs in `docs/decisions/` as numbered ADRs.
