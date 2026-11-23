import React from "react";
import type { SessionRow } from "../types.js";

interface SessionTableProps {
  sessions: SessionRow[];
  total: number;
  sort: "worst_qoe" | "worst_rebuffer" | "recent";
  onSortChange: (sort: "worst_qoe" | "worst_rebuffer" | "recent") => void;
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string | null;
  isLoading: boolean;
}

export const SessionTable: React.FC<SessionTableProps> = ({
  sessions,
  total,
  sort,
  onSortChange,
  onSelectSession,
  selectedSessionId,
  isLoading,
}) => {
  const getQoeBadge = (qoe: number | null) => {
    if (qoe === null) return { text: "—", bg: "var(--border-color)", fg: "var(--text-muted)" };
    if (qoe >= 85) return { text: qoe.toFixed(1), bg: "#065f46", fg: "#34d399" };
    if (qoe >= 65) return { text: qoe.toFixed(1), bg: "#78350f", fg: "#fbbf24" };
    return { text: qoe.toFixed(1), bg: "#7f1d1d", fg: "#f87171" };
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Session Drill-Down ({total} Total)</h2>
          <span style={styles.subtitle}>
            Select any session to inspect its granular event waterfall timeline
          </span>
        </div>

        <div style={styles.controls}>
          <label style={styles.label}>Sort By:</label>
          <select
            value={sort}
            onChange={(e) =>
              onSortChange(e.target.value as "worst_qoe" | "worst_rebuffer" | "recent")
            }
            style={styles.select}
          >
            <option value="worst_qoe">Worst QoE Score</option>
            <option value="worst_rebuffer">Highest Rebuffer Ratio</option>
            <option value="recent">Most Recent</option>
          </select>
        </div>
      </div>

      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.thRow}>
              <th style={styles.th}>Session ID</th>
              <th style={styles.th}>Platform & Device</th>
              <th style={styles.th}>Network</th>
              <th style={styles.th}>QoE Score</th>
              <th style={styles.th}>Startup</th>
              <th style={styles.th}>Rebuffer Ratio</th>
              <th style={styles.th}>Dropped</th>
              <th style={styles.th}>Health</th>
              <th style={styles.th}>Started At</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} style={styles.centerCell}>
                  Loading sessions...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={9} style={styles.centerCell}>
                  No session records matching the current filters.
                </td>
              </tr>
            ) : (
              sessions.map((s) => {
                const qoeBadge = getQoeBadge(s.qoe);
                const isSelected = s.session_id === selectedSessionId;

                return (
                  <tr
                    key={s.session_id}
                    onClick={() => onSelectSession(s.session_id)}
                    style={{
                      ...styles.tr,
                      ...(isSelected ? styles.trSelected : {}),
                    }}
                  >
                    <td style={{ ...styles.td, fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                      <span style={styles.linkText}>{s.session_id.slice(0, 13)}...</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.platformBadge}>{s.platform.toUpperCase()}</span>{" "}
                      <span style={styles.mutedText}>{s.device_model}</span>
                    </td>
                    <td style={styles.td}>{s.network_type}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          backgroundColor: qoeBadge.bg,
                          color: qoeBadge.fg,
                        }}
                      >
                        {qoeBadge.text}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {s.startup_ms !== null ? `${s.startup_ms}ms` : "—"}
                    </td>
                    <td style={styles.td}>
                      {s.rebuffer_ratio !== null ? `${(s.rebuffer_ratio * 100).toFixed(2)}%` : "0.00%"}
                    </td>
                    <td style={styles.td}>
                      {s.dropped > 0 ? (
                        <span style={{ color: "var(--accent-warning)" }}>{s.dropped}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td style={styles.td}>
                      {s.crash_or_anr ? (
                        <span style={styles.crashBadge}>CRASH/ANR</span>
                      ) : s.vsf ? (
                        <span style={styles.vsfBadge}>VSF</span>
                      ) : (
                        <span style={styles.okBadge}>OK</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, fontSize: "11px", color: "var(--text-muted)" }}>
                      {new Date(s.first_event_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  label: {
    fontSize: "12px",
    color: "var(--text-secondary)",
    fontWeight: "500",
  },
  select: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: "13px",
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
    textAlign: "left",
  },
  thRow: {
    borderBottom: "1px solid var(--border-color)",
  },
  th: {
    padding: "10px 12px",
    color: "var(--text-secondary)",
    fontWeight: "600",
    fontSize: "12px",
  },
  tr: {
    borderBottom: "1px solid var(--border-color)",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  trSelected: {
    backgroundColor: "var(--bg-surface-hover)",
  },
  td: {
    padding: "10px 12px",
    color: "var(--text-primary)",
  },
  centerCell: {
    padding: "30px",
    textAlign: "center",
    color: "var(--text-muted)",
  },
  linkText: {
    color: "var(--accent-primary)",
    textDecoration: "underline",
    fontWeight: "600",
  },
  platformBadge: {
    fontSize: "10px",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "var(--border-color)",
  },
  mutedText: {
    color: "var(--text-muted)",
    fontSize: "12px",
  },
  badge: {
    padding: "2px 8px",
    borderRadius: "12px",
    fontWeight: "700",
    fontSize: "11px",
    fontFamily: "var(--font-mono)",
  },
  crashBadge: {
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "var(--accent-danger)",
    color: "#fff",
    fontSize: "10px",
    fontWeight: "700",
  },
  vsfBadge: {
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "var(--accent-warning)",
    color: "#000",
    fontSize: "10px",
    fontWeight: "700",
  },
  okBadge: {
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "#065f46",
    color: "#34d399",
    fontSize: "10px",
    fontWeight: "700",
  },
};
