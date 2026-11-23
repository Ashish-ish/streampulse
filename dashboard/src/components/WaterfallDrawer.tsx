import React, { useState } from "react";
import type { SessionDetail } from "../types.js";

interface WaterfallDrawerProps {
  detail: SessionDetail | null;
  onClose: () => void;
  isLoading: boolean;
}

export const WaterfallDrawer: React.FC<WaterfallDrawerProps> = ({
  detail,
  onClose,
  isLoading,
}) => {
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  if (!detail && !isLoading) return null;

  const session = detail?.session;
  const waterfall = detail?.waterfall ?? [];

  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case "first_frame":
        return "#10b981";
      case "playback_error":
      case "app_health":
        return "#ef4444";
      case "buffering_start":
      case "buffering_end":
        return "#f59e0b";
      case "seek_start":
      case "seek_end":
        return "#8b5cf6";
      case "quality_change":
        return "#06b6d4";
      case "play_requested":
      case "session_start":
      case "playback_end":
      case "heartbeat":
      default:
        return "#3b82f6";
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>Session Waterfall Drill-Down</h3>
            <span style={styles.sessionId}>
              {session?.session_id ?? "Loading..."}
            </span>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>
            ✕ Close
          </button>
        </div>

        {isLoading ? (
          <div style={styles.loading}>Loading event timeline...</div>
        ) : (
          <div style={styles.content}>
            {/* Session Metadata Banner */}
            {session && (
              <div style={styles.metaBanner}>
                <div style={styles.metaCol}>
                  <span style={styles.metaLabel}>Platform / Device</span>
                  <span style={styles.metaVal}>
                    {session.platform.toUpperCase()} — {session.device_model}
                  </span>
                </div>
                <div style={styles.metaCol}>
                  <span style={styles.metaLabel}>Player & Protocol</span>
                  <span style={styles.metaVal}>
                    {session.player_name ?? "Default"} ({session.protocol ?? "hls"})
                  </span>
                </div>
                <div style={styles.metaCol}>
                  <span style={styles.metaLabel}>Startup Time</span>
                  <span style={styles.metaVal}>
                    {session.startup_ms !== null ? `${session.startup_ms}ms` : "—"}
                  </span>
                </div>
                <div style={styles.metaCol}>
                  <span style={styles.metaLabel}>Rebuffer Time</span>
                  <span style={styles.metaVal}>
                    {session.rebuffer_ms}ms ({session.rebuffer_count}x)
                  </span>
                </div>
                <div style={styles.metaCol}>
                  <span style={styles.metaLabel}>QoE Score</span>
                  <span style={{ ...styles.metaVal, color: "var(--accent-primary)", fontWeight: "bold" }}>
                    {session.qoe !== null ? session.qoe.toFixed(1) : "—"}
                  </span>
                </div>
              </div>
            )}

            {/* Event Waterfall Timeline */}
            <h4 style={styles.sectionTitle}>Event Execution Waterfall ({waterfall.length} Events)</h4>
            <div style={styles.timeline}>
              {waterfall.map((ev) => {
                const isExpanded = expandedSeq === ev.seq;
                const badgeColor = getEventBadgeColor(ev.type);

                return (
                  <div key={ev.seq} style={styles.timelineRow}>
                    <div style={styles.seqCol}>#{ev.seq}</div>
                    <div style={styles.timeCol}>
                      {ev.t_rel_ms >= 0 ? `+${ev.t_rel_ms}ms` : `${ev.t_rel_ms}ms`}
                    </div>
                    <div style={styles.eventCol}>
                      <div
                        style={{ ...styles.eventBadge, backgroundColor: badgeColor }}
                        onClick={() => setExpandedSeq(isExpanded ? null : ev.seq)}
                      >
                        {ev.type}
                      </div>

                      {/* Summary of event data inline */}
                      <span style={styles.eventSummary}>
                        {ev.type === "quality_change" && `${(ev.data as any).bitrate_bps / 1000}kbps`}
                        {ev.type === "playback_error" && `${(ev.data as any).code}: ${(ev.data as any).message}`}
                        {ev.type === "dropped_frames" && `dropped: ${(ev.data as any).dropped}, rendered: ${(ev.data as any).rendered}`}
                        {ev.type === "playback_end" && `reason: ${(ev.data as any).reason}`}
                        {ev.type === "app_health" && `kind: ${(ev.data as any).kind}`}
                        {ev.type === "heartbeat" && `pos: ${(ev.data as any).position_ms}ms, buf: ${(ev.data as any).buffered_ms}ms`}
                      </span>

                      {/* Expandable JSON details */}
                      {isExpanded && (
                        <pre style={styles.jsonBlock}>
                          {JSON.stringify(ev.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    zIndex: 9999,
    display: "flex",
    justifyContent: "flex-end",
  },
  drawer: {
    width: "600px",
    maxWidth: "90vw",
    height: "100%",
    backgroundColor: "var(--bg-surface)",
    borderLeft: "1px solid var(--border-color)",
    display: "flex",
    flexDirection: "column",
    boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.4)",
  },
  header: {
    padding: "20px 24px",
    borderBottom: "1px solid var(--border-color)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: "16px",
    fontWeight: "700",
    color: "var(--text-primary)",
  },
  sessionId: {
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
  },
  closeBtn: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: "12px",
    cursor: "pointer",
  },
  loading: {
    padding: "40px",
    textAlign: "center",
    color: "var(--text-muted)",
  },
  content: {
    padding: "24px",
    overflowY: "auto",
    flex: 1,
  },
  metaBanner: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "12px",
    padding: "14px",
    borderRadius: "8px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border-color)",
    marginBottom: "24px",
  },
  metaCol: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  metaLabel: {
    fontSize: "11px",
    color: "var(--text-muted)",
    fontWeight: "500",
  },
  metaVal: {
    fontSize: "13px",
    color: "var(--text-primary)",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: "var(--text-secondary)",
    marginBottom: "16px",
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  timelineRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    fontSize: "12px",
    padding: "6px 0",
    borderBottom: "1px solid var(--border-color)",
  },
  seqCol: {
    width: "36px",
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  },
  timeCol: {
    width: "80px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
  },
  eventCol: {
    flex: 1,
  },
  eventBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "4px",
    color: "#fff",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    marginRight: "8px",
  },
  eventSummary: {
    color: "var(--text-secondary)",
    fontSize: "11px",
    fontFamily: "var(--font-mono)",
  },
  jsonBlock: {
    marginTop: "8px",
    padding: "10px",
    borderRadius: "6px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
    fontSize: "11px",
    overflowX: "auto",
  },
};
