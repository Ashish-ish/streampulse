# 7. iOS AVPlayer Adapter and MetricKit Crash Correlation

Date: 2026-11-23

## Status

Accepted

## Context

StreamPulse requires telemetry collection for iOS players and crash/ANR correlation without replacing or conflicting with host crash reporters (e.g. Crashlytics, Sentry).

On iOS:
1. Video playback is driven primarily by `AVPlayer` and `AVPlayerItem`.
2. Unlike Android's `ApplicationExitInfo` (API 30+), iOS does not provide an immediate synchronous API at app launch to query the reason for the previous process termination.
3. Apple provides `MetricKit` (`MXMetricManagerSubscriber`, available since iOS 14), which aggregates metric and diagnostic payloads (`MXDiagnosticPayload`) including crash diagnostics (`MXCrashDiagnostic`) and hang diagnostics (`MXHangDiagnostic`).

## Decision

1. **AVPlayer Adapter (`StreamPulseAVPlayer`)**:
   - Observes `AVPlayer.timeControlStatus` via Key-Value Observing (KVO) to detect play intent and playback start without subclassing `AVPlayer`.
   - Listens to `AVPlayerItemPlaybackStalledNotification` to track rebuffer episodes, and `AVPlayerItemTimeJumpedNotification` to distinguish user seeks from stalls.
   - Extracts network bitrate and dropped video frames by subscribing to `AVPlayerItemNewAccessLogEntryNotification` and reading `AVPlayerItemAccessLogEvent.numberOfDroppedVideoFrames` and `indicatedBitrate` / `observedBitrate`.
   - Listens to `AVPlayerItemFailedToPlayToEndTimeNotification` and `AVPlayerItemNewErrorLogEntryNotification` to capture fatal and non-fatal playback errors.

2. **Breadcrumb Persistence**:
   - `BreadcrumbStore` writes the active `sessionId`, monotonic timestamp, and ISO wall-clock timestamp atomically to a lightweight JSON file (`streampulse_breadcrumb.json`) in the app support directory on session transitions and 10-second heartbeats.

3. **MetricKit Correlation**:
   - `StreamPulseMetricKitSubscriber` registers as an `MXMetricManagerSubscriber` on iOS 14+.
   - When Apple delivers `MXDiagnosticPayload` containing crash or hang events, StreamPulse reads the breadcrumb file to map the diagnostic to the last active session ID and emits an `app_health` event (with kind `crash` or `hang`).

4. **Measurement Honesty**:
   - MetricKit payloads are batched and delivered by the iOS daemon periodically (typically daily or on next launch after OS-level aggregation). Consequently, iOS crash correlation is asynchronous and best-effort compared to Android's deterministic `ApplicationExitInfo`. This boundary is documented in `docs/metrics.md`.

## Consequences

- Clean, decoupled integration with AVPlayer with zero private API usage.
- Compliant with App Store guidelines: no custom mach exception handlers or unsafe signal handling that could interfere with crash reporters.
- Deterministic session breadcrumbs ensure exact correlation whenever MetricKit diagnostics are received.
