# ADR 0001: Schema-First Specification and Type Codegen

## Context
Cross-platform telemetry libraries frequently suffer from subtle schema drift: event naming differences, mismatched required fields, type coercions (e.g. float vs int), and diverging validation rules across Android, iOS, Web, and the backend.

## Decision
1. `spec/event-schema.v1.json` (JSON Schema Draft 2020-12) is the single canonical source of truth for all telemetry contracts.
2. Code generators in `spec/codegen/generate.py` generate native types directly from this schema:
   - Kotlin: `@Serializable` data classes.
   - Swift: `Codable` structs.
   - TypeScript: Interfaces and union types.
3. CI enforces that no generated files are modified manually by failing if `spec/codegen/generate.py --check` detects any diff.

## Consequences
- **Positive**: Zero contract drift between SDKs and backend. Strict compile-time safety across all platforms.
- **Negative**: Schema changes require running the generator and committing updated generated models.
