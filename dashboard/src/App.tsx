import React, { useState, useEffect, useCallback } from "react";
import type {
  FilterState,
  KpiSummary,
  CorrelationBucket,
  TimeseriesPoint,
  SessionRow,
  SessionDetail,
} from "./types.js";
import {
  fetchSummary,
  fetchCorrelation,
  fetchTimeseries,
  fetchSessions,
  fetchSessionDetail,
} from "./api.js";
import { FilterBar } from "./components/FilterBar.js";
import { KpiStrip } from "./components/KpiStrip.js";
import { TimeSeriesChart } from "./components/TimeSeriesChart.js";
import { CorrelationPanel } from "./components/CorrelationPanel.js";
import { SessionTable } from "./components/SessionTable.js";
import { WaterfallDrawer } from "./components/WaterfallDrawer.js";

export const App: React.FC = () => {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [filters, setFilters] = useState<FilterState>({
    timeRange: "24h",
    platform: "all",
    appVersion: "all",
    networkType: "all",
  });

  const [metric, setMetric] = useState<string>("qoe");
  const [breakdown, setBreakdown] = useState<string>("none");
  const [corrDimension, setCorrDimension] = useState<"rebuffer" | "dropped_frame">("rebuffer");
  const [sessionSort, setSessionSort] = useState<"worst_qoe" | "worst_rebuffer" | "recent">("worst_qoe");

  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationBucket[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionTotal, setSessionTotal] = useState<number>(0);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync theme attribute to HTML
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [sum, corr, ts, sess] = await Promise.all([
        fetchSummary(filters),
        fetchCorrelation(filters, corrDimension),
        fetchTimeseries(filters, metric, breakdown),
        fetchSessions(filters, sessionSort, 25),
      ]);

      setSummary(sum);
      setCorrelation(corr);
      setTimeseries(ts);
      setSessions(sess.sessions);
      setSessionTotal(sess.total);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [filters, corrDimension, metric, breakdown, sessionSort]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load session waterfall detail when clicked
  const handleSelectSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setIsDetailLoading(true);
    try {
      const detail = await fetchSessionDetail(sessionId);
      setSessionDetail(detail);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedSessionId(null);
    setSessionDetail(null);
  };

  return (
    <div style={styles.appContainer}>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      {errorMessage && (
        <div style={styles.errorBanner}>
          <strong>Error loading telemetry:</strong> {errorMessage}. Ensure the Fastify server is running on port 3000.
        </div>
      )}

      <main style={styles.main}>
        <KpiStrip summary={summary} isLoading={isLoading} />

        <TimeSeriesChart
          data={timeseries}
          metric={metric}
          onMetricChange={setMetric}
          breakdown={breakdown}
          onBreakdownChange={setBreakdown}
          isLoading={isLoading}
        />

        <CorrelationPanel
          data={correlation}
          dimension={corrDimension}
          onDimensionChange={setCorrDimension}
          isLoading={isLoading}
        />

        <SessionTable
          sessions={sessions}
          total={sessionTotal}
          sort={sessionSort}
          onSortChange={setSessionSort}
          onSelectSession={handleSelectSession}
          selectedSessionId={selectedSessionId}
          isLoading={isLoading}
        />
      </main>

      {selectedSessionId && (
        <WaterfallDrawer
          detail={sessionDetail}
          onClose={handleCloseDetail}
          isLoading={isDetailLoading}
        />
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  main: {
    flex: 1,
    paddingBottom: "40px",
  },
  errorBanner: {
    margin: "16px 24px 0 24px",
    padding: "12px 16px",
    backgroundColor: "var(--accent-danger)",
    color: "#fff",
    borderRadius: "6px",
    fontSize: "13px",
  },
};
