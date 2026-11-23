# 9. Code Review, Architectural Improvements, and Multi-Platform Sample Stream Verification

Date: 2026-11-24

## Status

Accepted

## Context

Following full implementation of the StreamPulse QoE Telemetry monorepo across Android, iOS, React Native, Web, Backend, and Dashboard, an exhaustive code review and architectural audit was conducted alongside automated and live device verification with sample video streams on Android and iOS.

## Key Architectural Findings and Fixes

1. **State Machine Open Interval Closure**:
   - *Problem*: In `core/.../SessionStateMachine.kt`, `web/src/session.ts`, and `ios/Sources/StreamPulseSDK/StreamPulse.swift`, calling `end()` previously marked `state = ENDED` before calling `onBufferingEnd()` or `onSeekEnd()`. The state machine's state check guard immediately ignored subsequent calls, leaving open intervals unclosed and causing discrepancies in rebuffer ratio computation.
   - *Fix*: The closing interval events (`buffering_end`, `seek_end`) are explicitly emitted and their state flags cleared *prior* to setting the session state to `ENDED` and emitting `playback_end`. This guarantees deterministic metric interval calculation across KMP, Web, Swift, and React Native.

2. **Backend Timeseries Interval Granularity**:
   - *Problem*: `/v1/metrics/timeseries` in Fastify originally hardcoded 1-hour SQLite time buckets, limiting dashboard zoom capabilities.
   - *Fix*: Added dynamic `interval` query parameter supporting `minute` (`%Y-%m-%dT%H:%M:00.000Z`), `hour` (`%Y-%m-%dT%H:00:00.000Z`), and `day` (`%Y-%m-%dT00:00:00.000Z`).

3. **Floating Point Rounding and Number Formatting**:
   - *Problem*: SQL aggregate averages in `getMetricsSummary()` produced raw IEEE 754 precision artifacts (e.g., `0.016761000000000003`).
   - *Fix*: Applied 6-decimal precision rounding to `rebuffer_ratio` and `dropped_frame_ratio` and 2-decimal rounding to rates and QoE scores.

4. **Resilient Breadcrumb Filesystem Storage**:
   - *Problem*: `BreadcrumbStore` in `ios/Sources/StreamPulseSDK/BreadcrumbStore.swift` assumed `ApplicationSupportDirectory` is always writable, which fails in sandboxed CLI test harnesses and restricted application containers.
   - *Fix*: Added write verification and automatic fallback to `NSTemporaryDirectory()` and support for custom directory injection, ensuring atomic breadcrumb writes for crash/ANR correlation across all runtime environments.

5. **AVPlayer Adapter Test Harness & Lifecycle Verification**:
   - *Problem*: Swift test suite lacked an automated integration test exercising `StreamPulseAVPlayer` against real `AVPlayer` instances.
   - *Fix*: Added test target dependency in `Package.swift` and executed end-to-end AVPlayer lifecycle tests verifying KVO `timeControlStatus`, access log event parsing, stalling, and clean detachment.

## Multi-Platform Verification

- **Spec and Golden Fixtures**: Validated with `spec/check.py` and `spec/codegen/generate.py --check` (all 7 golden fixtures match Python oracle 100%).
- **Backend & Analytics**: Vitest suite with 12 tests validating ingestion, schema rejection, gzip compression, idempotency, rollup, timeseries, correlation, and event waterfall.
- **Web SDK**: Vitest suite with 10 tests across HTML5 video, hls.js adapter, IndexedDB queue, and offline recovery.
- **React Native SDK**: Vitest suite with 5 tests covering TurboModule bridge, listener forwarding, and `react-native-video` callbacks.
- **iOS SDK**: Swift test suite with 8 tests covering Golden Fixtures, EventQueue priority eviction, URL scrubbing, FNV-1a sampling, IntervalMath, BreadcrumbStore, SDK facade, and AVPlayer adapter. Verified on booted `iPhone 17` simulator.
- **Android SDK & Media3**: Kotlin Multiplatform JVM test suite (`jvmTest`) passing 100%. Sample app (`dev.streampulse.sample`) deployed and tested on running Android emulator (`emulator-5554`), verifying real Media3 ExoPlayer playback and telemetry (`session_start`, `play_requested`, `first_frame`, `quality_change`, `heartbeat`).
- **End-to-End System Test**: 50 synthetic sessions ingested with GZIP compression, query APIs tested, and React Vite dashboard served at `/dashboard`.
