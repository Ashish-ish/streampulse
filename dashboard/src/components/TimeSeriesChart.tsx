import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TimeseriesPoint } from "../types.js";

interface TimeSeriesChartProps {
  data: TimeseriesPoint[];
  metric: string;
  onMetricChange: (metric: string) => void;
  breakdown: string;
  onBreakdownChange: (breakdown: string) => void;
  isLoading: boolean;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  metric,
  onMetricChange,
  breakdown,
  onBreakdownChange,
  isLoading,
}) => {
  const getMetricKey = (m: string) => {
    switch (m) {
      case "startup":
        return "avg_startup_ms";
      case "rebuffer":
        return "avg_rebuffer_ratio";
      case "vsf":
        return "vsf_rate";
      case "dropped":
        return "avg_dropped_ratio";
      case "qoe":
      default:
        return "avg_qoe";
    }
  };



  // Group data by time bucket and breakdown key
  const chartMap = new Map<string, Record<string, unknown>>();
  const breakdownKeys = new Set<string>();

  const activeKey = getMetricKey(metric);

  for (const point of data) {
    const timeLabel = new Date(point.time).toLocaleTimeString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
    });

    if (!chartMap.has(timeLabel)) {
      chartMap.set(timeLabel, { time: timeLabel });
    }

    const seriesKey = breakdown !== "none" ? point.breakdown : "All";
    breakdownKeys.add(seriesKey);

    const row = chartMap.get(timeLabel)!;
    row[seriesKey] = point[activeKey as keyof TimeseriesPoint];
  }

  const chartData = Array.from(chartMap.values());
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>QoE Performance Over Time</h2>
          <span style={styles.subtitle}>
            Continuous monitoring across timeline intervals
          </span>
        </div>

        <div style={styles.controls}>
          {/* Metric Selector */}
          <select
            value={metric}
            onChange={(e) => onMetricChange(e.target.value)}
            style={styles.select}
          >
            <option value="qoe">Composite QoE Score</option>
            <option value="startup">Startup Time (ms)</option>
            <option value="rebuffer">Rebuffer Ratio</option>
            <option value="vsf">VSF Rate (%)</option>
            <option value="dropped">Dropped Frame Ratio</option>
          </select>

          {/* Breakdown Selector */}
          <select
            value={breakdown}
            onChange={(e) => onBreakdownChange(e.target.value)}
            style={styles.select}
          >
            <option value="none">No Breakdown</option>
            <option value="platform">By Platform</option>
            <option value="app_version">By App Version</option>
            <option value="network_type">By Network Type</option>
          </select>
        </div>
      </div>

      <div style={styles.chartWrapper}>
        {isLoading ? (
          <div style={styles.placeholder}>Loading timeseries data...</div>
        ) : chartData.length === 0 ? (
          <div style={styles.placeholder}>
            No session telemetry recorded in the selected window. Run the simulator to generate sessions!
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={12}
                domain={metric === "qoe" ? [0, 100] : ["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              />
              <Legend />
              {Array.from(breakdownKeys).map((key, idx) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  stroke={colors[idx % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
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
    marginBottom: "20px",
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
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  select: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: "13px",
  },
  chartWrapper: {
    width: "100%",
    minHeight: "320px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "40px",
    textAlign: "center",
  },
};
