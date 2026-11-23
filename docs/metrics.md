# StreamPulse Metric Definitions & QoE Formulation

This document specifies the exact, deterministic definitions of all Quality of Experience (QoE) metrics computed by StreamPulse. The reference implementation resides in `spec/lib/compute.py` and is verified by golden fixtures across all SDKs and the backend rollup engine.

---

## 1. Core Timing & Intervals

All durations are computed strictly from monotonic clock timestamps (`t_mono_ms`). Wall-clock timestamps (`t_wall`) are recorded exclusively for chronological ordering, server ingestion synchronization, and dashboard time-series bucketing.

Intervals are treated as half-open sets $[start, end)$ in milliseconds:
- $\text{measure}(I) = \sum_{(s, e) \in I} \max(0, e - s)$
- Overlapping seek intervals are subtracted from buffering intervals to prevent double-counting.

---

## 2. Metric Definitions

### 2.1 Startup Time
- **Definition**: The elapsed monotonic time from user playback request to the presentation of the first video frame.
  $$\text{startup\_ms} = \text{first\_frame.t\_mono\_ms} - \text{play\_requested.t\_mono\_ms}$$
- **Aggregation**: Reported as p50, p90, and p95 across sessions.
- **Pre-conditions**: Requires both `play_requested` and `first_frame` within the same play attempt. If clock regression occurs ($\text{startup\_ms} < 0$), the value is treated as invalid (`null`) and flagged.

### 2.2 Video Start Failure (VSF)
- **Definition**: Boolean flag indicating whether playback failed catastrophically before the first frame could be rendered.
- **Rule**: A session exhibits VSF if `play_requested` was recorded, no `first_frame` was observed, and a fatal `playback_error` event occurred.
  $$\text{VSF} = \text{has\_play} \land \neg\text{has\_first\_frame} \land \text{fatal\_error}$$

### 2.3 Exit Before Video Start (EBVS)
- **Definition**: Boolean flag indicating intentional user abandonment prior to video start in the absence of playback errors.
- **Rule**: A session exhibits EBVS if `play_requested` was recorded, no `first_frame` was observed, no error occurred, and `playback_end` with reason `user_exit` was received.
  $$\text{EBVS} = \text{has\_play} \land \neg\text{has\_first\_frame} \land \neg\text{any\_error} \land \text{user\_exit}$$

### 2.4 Exit Before Start (Other)
- **Definition**: Sessions that ended prior to video start due to non-exit, non-fatal reasons (e.g., app moved to background).
  $$\text{exit\_before\_start\_other} = \text{has\_play} \land \neg\text{has\_first\_frame} \land \neg\text{VSF} \land \neg\text{EBVS}$$

### 2.5 Rebuffer Time, Count & Ratio
- **Rebuffer Interval**: Any buffering period $[t_{\text{start}}, t_{\text{end}})$ occurring *after* `first_frame`, excluding any portion that overlaps an active seek interval $[s_{\text{start}}, s_{\text{end}})$.
- **Rebuffer Time ($\text{rebuffer\_ms}$)**: Cumulative duration of all clipped rebuffer intervals.
- **Rebuffer Count ($\text{rebuffer\_count}$)**: Count of discrete rebuffering episodes with non-zero measured duration after seek subtraction.
- **Play Time ($\text{play\_time\_ms}$)**: Net active playback duration:
  $$\text{play\_time\_ms} = \text{watch\_ms} - \text{seek\_ms} - \text{rebuffer\_ms}$$
- **Rebuffer Ratio**:
  $$\text{rebuffer\_ratio} = \frac{\text{rebuffer\_ms}}{\text{play\_time\_ms} + \text{rebuffer\_ms}}$$
- **Rebuffers Per Hour**:
  $$\text{rebuffers\_per\_hour} = \frac{\text{rebuffer\_count} \times 3{,}600{,}000}{\text{play\_time\_ms}} \quad (\text{for } \text{play\_time\_ms} > 0)$$

### 2.6 Dropped Frame Ratio
- **Definition**: Proportion of video frames dropped by the renderer relative to total frames presented for decoding.
  $$\text{dropped\_frame\_ratio} = \frac{\text{dropped}}{\text{dropped} + \text{rendered}}$$
- **Sampling Discipline**: Dropped frames are collected periodically (polled via display/player callbacks) as deltas, guaranteeing zero per-frame CPU allocation.

### 2.7 Average Bitrate & Bitrate Switches
- **Average Bitrate ($\text{avg\_bitrate\_bps}$)**: Time-weighted average bitrate across the session after `first_frame`.
  $$\text{avg\_bitrate\_bps} = \frac{\sum (\text{bitrate}_i \times \Delta t_i)}{\sum \Delta t_i}$$
- **Bitrate Switch Count**: Total count of `quality_change` transitions occurring during active playback.

### 2.8 Playback Failure Rate
- **Definition**: Sessions that achieved `first_frame` but subsequently encountered a fatal `playback_error` event, divided by total sessions with `first_frame`.

---

## 3. Crash and ANR Correlation

StreamPulse correlates application health incidents with playback sessions to identify whether aggressive buffering, resource contention, or decoder starvation contribute to system crashes or Application Not Responding (ANR) events.

### 3.1 Bucketing
Sessions are segmented into 5 standard distribution buckets based on their `rebuffer_ratio` and `dropped_frame_ratio`:
1. `0`: Exactly 0%
2. `0-1%`: $> 0\%$ and $\le 1\%$
3. `1-3%`: $> 1\%$ and $\le 3\%$
4. `3-10%`: $> 3\%$ and $\le 10\%$
5. `>10%`: $> 10\%$

### 3.2 Correlation Attribution: Exact vs. Best-Effort

| Platform | Diagnostic Mechanism | Correlation Accuracy | Latency / Notes |
|:---|:---|:---|:---|
| **Android (API 30+)** | `ApplicationExitInfo` (`REASON_ANR`, `REASON_CRASH_NATIVE`, `REASON_CRASH`) + breadcrumb file | **Exact** for recent foreground sessions | Collected on next cold launch. Reads session breadcrumb persisted during heartbeats. |
| **Android (API < 30)** | Chained `UncaughtExceptionHandler` | **Exact** for Java/Kotlin unhandled exceptions; **Best-Effort** for ANR | Writes breadcrumb file synchronously before delegating to default OS handler. |
| **iOS** | `MetricKit` (`MXCrashDiagnostic`, `MXHangDiagnostic`) | **Best-Effort** | Apple delivers MetricKit payloads once per day or on next cold start. Diagnostic timestamps are correlated against breadcrumb session intervals. |
| **Web** | `window.onerror` / `unhandledrejection` + `sendBeacon` | **Exact** for JS unhandled exceptions; **Unavailable** for browser process OOM/crashes | Dispatched synchronously via `navigator.sendBeacon` upon failure. |

---

## 4. Composite QoE Score (0–100)

The composite QoE score condenses multi-dimensional stream quality into an intuitive 0–100 index. Weights are explicitly configured in `spec/qoe-weights.v1.json` rather than hardcoded magic numbers.

### Default Weighting Table
| Dimension | Weight ($w_k$) | Thresholds |
|:---|:---|:---|
| **Startup Time** | 0.30 | Optimal: $\le 1{,}000\text{ ms}$; Unacceptable: $\ge 5{,}000\text{ ms}$ |
| **Rebuffer Ratio** | 0.35 | Unacceptable: $\ge 10.0\%$ |
| **Dropped Frames** | 0.15 | Unacceptable: $\ge 5.0\%$ |
| **Playback Failure**| 0.20 | Binary: 100 if no fatal error, 0 if fatal error |

$$\sum w_k = 0.30 + 0.35 + 0.15 + 0.20 = 1.00$$

### Sub-Score Formulations
1. **Startup Score ($S_{\text{start}}$)**:
   $$S_{\text{start}} = \begin{cases}
   100 & \text{if } t \le 1{,}000\text{ ms} \\
   0 & \text{if } t \ge 5{,}000\text{ ms} \\
   100 \times \frac{5000 - t}{5000 - 1000} & \text{otherwise}
   \end{cases}$$

2. **Ratio Penalty Score ($S_{\text{penalty}}$)** for Rebuffer and Dropped Frames:
   $$\text{penalty} = \min\left(1.0, \frac{\text{ratio}}{\text{ratio\_bad}}\right)$$
   $$S_{\text{penalty}} = 100 \times (1.0 - \text{penalty})$$

3. **Composite Calculation**:
   $$\text{QoE} = w_{\text{start}} S_{\text{start}} + w_{\text{rebuf}} S_{\text{rebuf}} + w_{\text{drop}} S_{\text{drop}} + w_{\text{fail}} S_{\text{fail}}$$
