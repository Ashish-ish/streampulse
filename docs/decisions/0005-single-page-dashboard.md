# ADR 0005: Sideloaded Single-Page Dashboard Architecture

## Context
Operators and developers need immediate visual inspection of QoE telemetry without managing separate dashboard microservices, hosting configurations, or mobile monitoring apps.

## Decision
1. The dashboard is a single-page application built with React, Vite, and TypeScript.
2. The dashboard is compiled to static assets and served directly by the Fastify backend at `/dashboard`.
3. The dashboard UI contains exactly five coordinated analytical views:
   - Global Filter Bar (Time, Platform, Version, Network)
   - KPI Summary Strip
   - Primary Time-Series Chart (metric selector + breakdown)
   - Crash/ANR Correlation Panel (rebuffer and dropped frame buckets)
   - Worst-Sessions Drill-Down Table with an Event Waterfall Drawer
4. Zero external CDN dependencies (fonts, icons, and libraries bundled locally) ensuring air-gapped / offline operability.

## Consequences
- **Positive**: Clean single-command developer experience. Fastify serves both the ingest/query APIs and the dashboard UI.
- **Negative**: No standalone mobile dashboard app, adhering strictly to non-goals.
