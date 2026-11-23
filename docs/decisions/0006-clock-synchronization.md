# ADR 0006: Monotonic Clocks for Duration and Server Skew Correction

## Context
Device wall clocks are notoriously unreliable: users manually change system times, NTP adjustments create jumps, and devices drift across time zones. Computing durations with wall-clock time leads to negative startup times, erratic rebuffering counts, and invalid percentiles.

## Decision
1. **Durations and Intervals**: All interval and elapsed duration measurements (`startup_ms`, `rebuffer_ms`, `play_time_ms`, interval math) exclusively use monotonic timestamps (`t_mono_ms` via `System.nanoTime()` / `clock_gettime(CLOCK_MONOTONIC)` / `performance.now()`).
2. **Wall Clock (`t_wall`)**: Used only for event ordering within timelines and time-series bucketing on the backend.
3. **Clock Skew Correction**: Server responses include the standard HTTP `Date` header. Clients compute the delta between local wall-clock and server time:
   $$\Delta_{\text{skew}} = T_{\text{server\_date}} - T_{\text{local\_wall}}$$
   Batches apply this offset to `sent_at` and `t_wall` to align client sessions with server wall time.

## Consequences
- **Positive**: Complete immunity to device clock changes and NTP synchronization jumps during playback. Accurate interval calculations.
- **Negative**: Requires maintaining two timestamps (`t_mono_ms` and `t_wall`) per event.
