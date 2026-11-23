import React from "react";
import type { FilterState } from "../types.js";

interface FilterBarProps {
  filters: FilterState;
  onChange: (updated: FilterState) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  theme,
  onToggleTheme,
  onRefresh,
  isLoading,
}) => {
  return (
    <header style={styles.container}>
      <div style={styles.branding}>
        <div style={styles.logoBadge}>SP</div>
        <div>
          <h1 style={styles.title}>StreamPulse</h1>
          <span style={styles.subtitle}>QoE Telemetry & Performance Dashboard</span>
        </div>
      </div>

      <div style={styles.controls}>
        {/* Time Range */}
        <div style={styles.filterGroup}>
          <label style={styles.label}>Window</label>
          <div style={styles.btnGroup}>
            {(["1h", "6h", "24h", "7d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChange({ ...filters, timeRange: r })}
                style={{
                  ...styles.btnGroupItem,
                  ...(filters.timeRange === r ? styles.btnGroupItemActive : {}),
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Platform */}
        <div style={styles.filterGroup}>
          <label style={styles.label}>Platform</label>
          <select
            value={filters.platform}
            onChange={(e) => onChange({ ...filters, platform: e.target.value })}
            style={styles.select}
          >
            <option value="all">All Platforms</option>
            <option value="android">Android</option>
            <option value="ios">iOS</option>
            <option value="web">Web</option>
            <option value="rn">React Native</option>
          </select>
        </div>

        {/* App Version */}
        <div style={styles.filterGroup}>
          <label style={styles.label}>App Version</label>
          <select
            value={filters.appVersion}
            onChange={(e) => onChange({ ...filters, appVersion: e.target.value })}
            style={styles.select}
          >
            <option value="all">All Versions</option>
            <option value="1.0.0">v1.0.0</option>
            <option value="1.1.0">v1.1.0</option>
            <option value="1.2.0">v1.2.0</option>
          </select>
        </div>

        {/* Network Type */}
        <div style={styles.filterGroup}>
          <label style={styles.label}>Network</label>
          <select
            value={filters.networkType}
            onChange={(e) => onChange({ ...filters, networkType: e.target.value })}
            style={styles.select}
          >
            <option value="all">All Networks</option>
            <option value="wifi">WiFi</option>
            <option value="cellular">Cellular</option>
            <option value="ethernet">Ethernet</option>
          </select>
        </div>

        {/* Action Buttons */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          style={styles.actionBtn}
          title="Refresh telemetry metrics"
        >
          {isLoading ? "⟳ Loading..." : "↻ Refresh"}
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          style={styles.themeBtn}
          title="Toggle Light/Dark Theme"
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "16px 24px",
    backgroundColor: "var(--bg-surface)",
    borderBottom: "1px solid var(--border-color)",
  },
  branding: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logoBadge: {
    width: "38px",
    height: "38px",
    borderRadius: "8px",
    backgroundColor: "var(--accent-primary)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "18px",
    letterSpacing: "0.5px",
  },
  title: {
    fontSize: "18px",
    fontWeight: "700",
    color: "var(--text-primary)",
  },
  subtitle: {
    fontSize: "12px",
    color: "var(--text-muted)",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "16px",
  },
  filterGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--text-secondary)",
  },
  select: {
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: "13px",
    outline: "none",
  },
  btnGroup: {
    display: "inline-flex",
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid var(--border-color)",
  },
  btnGroupItem: {
    padding: "6px 12px",
    border: "none",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-secondary)",
    fontSize: "12px",
    cursor: "pointer",
    fontWeight: "500",
  },
  btnGroupItemActive: {
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    fontWeight: "600",
  },
  actionBtn: {
    padding: "6px 14px",
    borderRadius: "6px",
    border: "1px solid var(--accent-primary)",
    backgroundColor: "var(--accent-primary)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  themeBtn: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: "13px",
    cursor: "pointer",
  },
};
