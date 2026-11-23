# ADR 0003: Kotlin Multiplatform Core with Independent Web TypeScript Implementation

## Context
We need to support Android, iOS, React Native, and Web while maintaining scope discipline and high performance on every target.

## Decision
1. **Kotlin Multiplatform (KMP)** handles all session state machine, metric folding, SQLite persistence (SQLDelight), and HTTP transport (Ktor) for Android and iOS.
2. **iOS** consumes an XCFramework generated from KMP with a clean Swift wrapper.
3. **React Native** implements a thin TurboModule bridge over the native Android and iOS SDKs rather than reimplementing event management in JavaScript.
4. **Web** uses an independent TypeScript implementation optimized for browsers (IndexedDB queue, zero runtime dependencies, `sendBeacon`/`fetch keepalive`), verified against the shared golden fixtures.

## Consequences
- **Positive**: Eliminates duplicated logic on mobile platforms while delivering optimal bundle size and zero runtime overhead in browser environments.
- **Negative**: Requires maintaining both a Kotlin and TypeScript implementation of the session fold, mitigated by ADR 0002.
