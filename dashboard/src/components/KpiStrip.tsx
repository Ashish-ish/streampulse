import React from "react";
import type { KpiSummary } from "../types.js";

interface KpiStripProps {
  summary: KpiSummary | null;
  isLoading: boolean;
}

export const KpiStrip: React.FC<KpiStripProps> = ({ summary, isLoading }) => {
  const formatMs = (val: number | null) => (val !== null ? `${val} ms` : "—");
  const formatPct = (val: number | null) =>
    val !== null ? `${(val * 100).toFixed(2)}%` : "—";
  const formatDirectPct = (val: number | null) =>
    val !== null ? `${val.toFixed(2)}%` : "—";

  const cards = [
    {
      title: "Startup Time (p50 / p95)",
      value: summary ? `${formatMs(summary.startup_p50_ms)} / ${formatMs(summary.startup_p95_ms)}` : "—",
      hint: "Target: p50 < 1000ms",
      status: summary?.startup_p50_ms && summary.startup_p50_ms < 1000 ? "good" : "warn",
    },
    {
      title: "Rebuffer Ratio",
      value: summary ? formatPct(summary.rebuffer_ratio) : "—",
      hint: "Excluding seeks",
      status: summary && summary.rebuffer_ratio < 0.02 ? "good" : "warn",
    },
    {
      title: "Video Start Failure (VSF)",
      value: summary ? formatDirectPct(summary.vsf_rate) : "—",
      hint: "Fatal errors pre-start",
      status: summary && summary.vsf_rate < 1.0 ? "good" : "danger",
    },
    {
      title: "Exit Before Start (EBVS)",
      value: summary ? formatDirectPct(summary.ebvs_rate) : "—",
      hint: "User drop-off before 1st frame",
      status: "neutral",
    },
    {
      title: "Dropped Frame Ratio",
      value: summary ? formatPct(summary.dropped_frame_ratio) : "—",
      hint: "Dropped / Total frames",
      status: summary && summary.dropped_frame_ratio < 0.01 ? "good" : "warn",
    },
    {
      title: "Crash/ANR-Free Sessions",
      value: summary ? formatDirectPct(summary.crash_free_sessions_rate) : "—",
      hint: "Health event correlation",
      status: summary && summary.crash_free_sessions_rate > 98 ? "good" : "danger",
    },
    {
      title: "Composite QoE Index",
      value: summary?.avg_qoe !== null && summary?.avg_qoe !== undefined ? summary.avg_qoe.toFixed(1) : "—",
      hint: "Weighted 0–100 scale",
      status: summary?.avg_qoe && summary.avg_qoe > 85 ? "good" : "warn",
      highlight: true,
    },
  ];

  return (
    <div style={styles.grid}>
      {cards.map((card, idx) => {
        let badgeColor = "var(--text-muted)";
        if (card.status === "good") badgeColor = "var(--accent-success)";
        else if (card.status === "warn") badgeColor = "var(--accent-warning)";
        else if (card.status === "danger") badgeColor = "var(--accent-danger)";

        return (
          <div
            key={idx}
            style={{
              ...styles.card,
              ...(card.highlight ? styles.cardHighlight : {}),
            }}
          >
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>{card.title}</span>
              <span style={{ ...styles.cardDot, backgroundColor: badgeColor }} />
            </div>
            <div style={styles.cardValue}>
              {isLoading ? "..." : card.value}
            </div>
            <div style={styles.cardHint}>{card.hint}</div>
          </div>
        );
      })}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
    padding: "20px 24px",
  },
  card: {
    padding: "16px",
    borderRadius: "8px",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-color)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  cardHighlight: {
    borderLeft: "4px solid var(--accent-primary)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  cardTitle: {
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--text-secondary)",
    letterSpacing: "0.2px",
  },
  cardDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
  },
  cardValue: {
    fontSize: "20px",
    fontWeight: "700",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    marginBottom: "4px",
  },
  cardHint: {
    fontSize: "11px",
    color: "var(--text-muted)",
  },
};
