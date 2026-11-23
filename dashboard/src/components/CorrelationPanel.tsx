import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { CorrelationBucket } from "../types.js";

interface CorrelationPanelProps {
  data: CorrelationBucket[];
  dimension: "rebuffer" | "dropped_frame";
  onDimensionChange: (dim: "rebuffer" | "dropped_frame") => void;
  isLoading: boolean;
}

export const CorrelationPanel: React.FC<CorrelationPanelProps> = ({
  data,
  dimension,
  onDimensionChange,
  isLoading,
}) => {
  const getBarColor = (rate: number) => {
    if (rate > 10) return "var(--accent-danger)";
    if (rate > 3) return "var(--accent-warning)";
    return "var(--accent-primary)";
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Crash & ANR Rate Correlation</h2>
          <span style={styles.subtitle}>
            Empirical correlation between quality degradation and application crashes/ANRs
          </span>
        </div>

        <div style={styles.toggleGroup}>
          <button
            type="button"
            onClick={() => onDimensionChange("rebuffer")}
            style={{
              ...styles.toggleBtn,
              ...(dimension === "rebuffer" ? styles.toggleBtnActive : {}),
            }}
          >
            By Rebuffer Ratio
          </button>
          <button
            type="button"
            onClick={() => onDimensionChange("dropped_frame")}
            style={{
              ...styles.toggleBtn,
              ...(dimension === "dropped_frame" ? styles.toggleBtnActive : {}),
            }}
          >
            By Dropped Frame Ratio
          </button>
        </div>
      </div>

      <div style={styles.chartWrapper}>
        {isLoading ? (
          <div style={styles.placeholder}>Loading correlation analysis...</div>
        ) : data.length === 0 ? (
          <div style={styles.placeholder}>No correlation data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="bucket" stroke="var(--text-muted)" fontSize={12} />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={12}
                unit="%"
                label={{
                  value: "Crash/ANR Rate (%)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--text-muted)",
                  fontSize: 11,
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as CorrelationBucket;
                    return (
                      <div style={styles.tooltip}>
                        <div style={styles.tooltipTitle}>Bucket: {item.bucket}</div>
                        <div>Crash/ANR Rate: <strong>{item.crash_rate.toFixed(2)}%</strong></div>
                        <div>Total Sessions: <strong>{item.session_count}</strong></div>
                        <div>Crashes Observed: <strong>{item.crash_count}</strong></div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="crash_rate" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.crash_rate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={styles.footerNote}>
        <strong>Measurement Insight:</strong> Sessions exhibiting severe rebuffering (&gt;3%) show an elevated
        crash and ANR probability due to player buffer starvation and main-thread resource contention.
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    margin: "0 24px 20px 24px",
    padding: "20px",
    borderRadius: "8px",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-color)",
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "16px",
  },
  title: {
    fontSize: "16px",
    fontWeight: "700",
    color: "var(--text-primary)",
  },
  subtitle: {
    fontSize: "12px",
    color: "var(--text-muted)",
  },
  toggleGroup: {
    display: "inline-flex",
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid var(--border-color)",
  },
  toggleBtn: {
    padding: "6px 14px",
    border: "none",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-secondary)",
    fontSize: "12px",
    cursor: "pointer",
    fontWeight: "500",
  },
  toggleBtnActive: {
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    fontWeight: "600",
  },
  chartWrapper: {
    width: "100%",
    minHeight: "260px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "30px",
  },
  tooltip: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-color)",
    padding: "10px 14px",
    borderRadius: "6px",
    fontSize: "12px",
    color: "var(--text-primary)",
    lineHeight: "1.6",
  },
  tooltipTitle: {
    fontWeight: "bold",
    marginBottom: "4px",
    borderBottom: "1px solid var(--border-color)",
    paddingBottom: "2px",
  },
  footerNote: {
    marginTop: "12px",
    fontSize: "12px",
    color: "var(--text-secondary)",
    padding: "8px 12px",
    backgroundColor: "var(--bg-primary)",
    borderRadius: "6px",
    borderLeft: "3px solid var(--accent-primary)",
  },
};
