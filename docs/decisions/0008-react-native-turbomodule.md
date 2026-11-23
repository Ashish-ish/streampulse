# 8. React Native TurboModule Architecture and react-native-video Adapter

Date: 2026-11-23

## Status

Accepted

## Context

StreamPulse provides a React Native package for video apps built on React Native.
Per the project requirements:
1. "React Native wraps the native SDKs; it does not reimplement logic."
2. "React Native: TurboModule bridging the native SDKs, JS API mirroring the shared API, adapter for react-native-video events. Keep it thin."
3. Public API must remain identical in shape to Android, iOS, and Web.

## Decision

1. **TurboModule Spec (`NativeStreamPulse`)**:
   - Built for the React Native New Architecture (`TurboModuleRegistry.getEnforcing<Spec>("StreamPulse")`) with backwards compatibility fallback for legacy Bridge architecture.
   - Exposes minimal C++ / JNI / ObjC++ bindings:
     - `initialize(config)`
     - `createSession(meta)` -> returns `sessionId`
     - `emitEvent(sessionId, type, dataJson)`
     - `releaseSession(sessionId)`
     - `setEnabled(enabled)`
     - `flush()` -> returns `Promise<boolean>`

2. **Native Delegation**:
   - On Android: `StreamPulseModule.kt` delegates directly to the Android SDK (`StreamPulseAndroid`), which runs the KMP core state machine and persistent SQLDelight queue.
   - On iOS: `StreamPulseRN.swift` delegates directly to the Swift Package (`StreamPulseSDK`), which runs the session state machine, EventQueue, and MetricKit correlation.

3. **`react-native-video` Adapter**:
   - Supplies a helper hook `useStreamPulseVideo(sessionMeta)` or `createVideoProps(session)` that hooks into standard `<Video>` callbacks (`onLoadStart`, `onReadyForDisplay`, `onBuffer`, `onSeek`, `onBandwidthUpdate`, `onError`, `onEnd`).
   - Normalizes video player callbacks to StreamPulse event signals without overhead.

## Consequences

- Zero logic duplication: metrics, sampling, interval math, and offline queueing stay inside the battle-tested native cores.
- Predictable performance: hot player events dispatch cleanly across JNI / ObjC without JS runtime overhead.
