# ADR 0002: Cross-Platform Metric Parity via Shared Golden Fixtures

## Context
Video metrics (e.g., startup time, rebuffer ratio, dropped frame ratio) are defined with complex edge-case rules: seek overlapping buffering, exit before start, fatal error timing, and adaptive bitrate time-weighting. Reimplementing these formulas independently on multiple platforms often leads to metric discrepancies.

## Decision
1. Define a reference metric oracle in `spec/lib/compute.py`.
2. Generate golden fixture JSON files in `spec/fixtures/` covering canonical playback scenarios and edge cases.
3. Every implementation (Python oracle, KMP commonTest, Web SDK Vitest, and backend ingest rollup) must pass the exact same golden fixtures with 100% numerical and structural agreement.

## Consequences
- **Positive**: Absolute confidence that numbers reported on Web match numbers reported on Android and iOS. Eliminates platform-specific reporting disputes.
- **Negative**: Any change to metric algorithms requires updating the oracle, re-generating golden fixtures, and updating test assertions across all targets.
