# Contributing to StreamPulse

Thank you for your interest in contributing to StreamPulse! StreamPulse is an open-source, portfolio-grade project where code quality, measurement rigor, and strict boundaries matter.

---

## 1. Ground Rules & Scope Discipline

- **No Feature Creep**: StreamPulse focuses on playback QoE telemetry, offline queueing, and performance visualization. Features outside this scope (e.g., ad tracking, custom players, machine learning) are non-goals.
- **Conventional Commits**: Every commit must adhere to [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `docs(scope): ...`
  - `test(scope): ...`
  - `refactor(scope): ...`
- **Architecture Decisions (ADRs)**: If you make a significant architectural decision, document it as a lightweight ADR under `docs/decisions/`.

---

## 2. Schema-First Workflow

The single source of truth for all telemetry events is `/spec/event-schema.v1.json`.

1. **Never edit generated files directly**:
   - `core/.../StreamPulseModels.kt`
   - `ios/.../StreamPulseModels.swift`
   - `web/src/schema/models.ts`
   - `server/src/models.ts`
2. **If the schema changes**:
   - Update `spec/event-schema.v1.json`.
   - Run the codegen script:
     ```bash
     python3 spec/codegen/generate.py
     ```
   - Verify that all fixtures and tests pass:
     ```bash
     make check
     ```
   - CI will fail if generated files do not match the schema.

---

## 3. Metric Parity & Fixture Verification

Any change to metric calculation formulas must preserve cross-platform parity:
1. Golden fixtures reside in `spec/fixtures/`.
2. The Python oracle (`spec/lib/compute.py`) defines the reference calculation.
3. Every client SDK (Kotlin Multiplatform, Web TypeScript, Swift iOS, Fastify Rollup) must pass the exact same golden fixtures.

---

## 4. Local Development & Verification

Before submitting a pull request, run the verification suite:
```bash
# Verify schema & codegen freshness
make check

# Run tests across all modules
make test
```
