import { buildServer } from "../server/dist/server.js";
import { generateSessionBatch } from "../tools/simulator/dist/generator.js";
import { SeededRNG } from "../tools/simulator/dist/prng.js";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runEndToEndVerification() {
  console.log("============================================================");
  console.log("StreamPulse End-to-End System & API Verification");
  console.log("============================================================");

  const testDbPath = path.resolve(__dirname, "e2e_test.db");
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  const app = buildServer({
    dbFilePath: testDbPath,
    logger: false,
    dashboardDistPath: path.resolve(__dirname, "../dashboard/dist"),
  });
  await app.ready();
  console.log("✓ Server initialized with SQLite WAL and Dashboard static router");

  // 1. Health check
  const healthRes = await app.inject({ method: "GET", url: "/v1/health" });
  if (healthRes.statusCode !== 200) throw new Error("Health check failed");
  console.log(`✓ GET /v1/health -> 200 OK (${healthRes.json().status})`);

  // 2. Ingest 50 diverse sessions using simulator PRNG
  console.log("\n[Ingestion Phase]");
  const rng = new SeededRNG(999);
  const sessionIds = [];

  for (let i = 0; i < 50; i++) {
    const batch = generateSessionBatch(rng, "mixed", i * 60000);
    const sessionId = batch.events[0].session_id;
    sessionIds.push(sessionId);

    // Send half as JSON, half as GZIP
    const headers = { "content-type": "application/json" };
    let payload;

    if (i % 2 === 0) {
      payload = JSON.stringify(batch);
    } else {
      headers["content-encoding"] = "gzip";
      payload = zlib.gzipSync(Buffer.from(JSON.stringify(batch), "utf-8"));
    }

    const res = await app.inject({
      method: "POST",
      url: "/v1/batches",
      headers,
      payload,
    });

    if (res.statusCode !== 202) {
      throw new Error(`Batch ${i} ingestion failed: ${res.statusCode} ${res.body}`);
    }
  }
  console.log(`✓ Ingested 50 realistic sessions (JSON & GZIP compressed batches)`);

  // 3. Test Query API: Summary
  console.log("\n[Metrics API Verification]");
  const summaryRes = await app.inject({ method: "GET", url: "/v1/metrics/summary" });
  if (summaryRes.statusCode !== 200) throw new Error("Summary API failed");
  const summary = summaryRes.json();
  console.log(`✓ GET /v1/metrics/summary -> 200 OK:`);
  console.log(`   - Total Sessions: ${summary.total_sessions}`);
  console.log(`   - Average QoE Score: ${summary.avg_qoe}`);
  console.log(`   - Startup p50: ${summary.startup_p50_ms} ms | p95: ${summary.startup_p95_ms} ms`);
  console.log(`   - Rebuffer Ratio: ${summary.rebuffer_ratio}`);
  console.log(`   - Crash-Free Sessions Rate: ${summary.crash_free_sessions_rate}%`);
  console.log(`   - Video Start Failure (VSF) Rate: ${summary.vsf_rate}%`);
  console.log(`   - Exit Before Video Start (EBVS) Rate: ${summary.ebvs_rate}%`);

  if (summary.total_sessions !== 50) {
    throw new Error(`Expected 50 sessions, got ${summary.total_sessions}`);
  }

  // 4. Test Query API: Timeseries
  const tsRes = await app.inject({
    method: "GET",
    url: "/v1/metrics/timeseries?metric=qoe&interval=hour",
  });
  if (tsRes.statusCode !== 200) throw new Error("Timeseries API failed");
  const tsData = tsRes.json();
  console.log(`✓ GET /v1/metrics/timeseries -> 200 OK (${tsData.length} time buckets)`);

  // 5. Test Query API: Correlation (rebuffer & dropped_frame)
  const rebufferCorrRes = await app.inject({
    method: "GET",
    url: "/v1/metrics/correlation?dimension=rebuffer",
  });
  if (rebufferCorrRes.statusCode !== 200) throw new Error("Rebuffer correlation API failed");
  const rebufferBuckets = rebufferCorrRes.json();
  console.log(`✓ GET /v1/metrics/correlation?dimension=rebuffer -> 200 OK (${rebufferBuckets.length} buckets: ${rebufferBuckets.map(b => b.bucket).join(", ")})`);

  const dropCorrRes = await app.inject({
    method: "GET",
    url: "/v1/metrics/correlation?dimension=dropped_frame",
  });
  if (dropCorrRes.statusCode !== 200) throw new Error("Dropped frames correlation API failed");
  console.log(`✓ GET /v1/metrics/correlation?dimension=dropped_frame -> 200 OK`);

  // 6. Test Query API: Session List with Filters
  console.log("\n[Session Drill-Down Verification]");
  const listRes = await app.inject({
    method: "GET",
    url: "/v1/sessions?limit=10&offset=0",
  });
  if (listRes.statusCode !== 200) throw new Error("Session list API failed");
  const sessionList = listRes.json();
  console.log(`✓ GET /v1/sessions -> 200 OK (returned ${sessionList.sessions.length} sessions, total: ${sessionList.total})`);

  // 7. Test Query API: Session Detail & Waterfall
  const sampleSessionId = sessionIds[0];
  const detailRes = await app.inject({
    method: "GET",
    url: `/v1/sessions/${sampleSessionId}`,
  });
  if (detailRes.statusCode !== 200) throw new Error("Session detail API failed");
  const detail = detailRes.json();
  console.log(`✓ GET /v1/sessions/${sampleSessionId} -> 200 OK:`);
  console.log(`   - Platform: ${detail.session.platform} | Player: ${detail.session.player_name}`);
  console.log(`   - QoE: ${detail.session.qoe} | Startup: ${detail.session.startup_ms} ms`);
  console.log(`   - Waterfall events count: ${detail.waterfall.length}`);

  // 8. Test Query API: Waterfall raw events
  const eventsRes = await app.inject({
    method: "GET",
    url: `/v1/sessions/${sampleSessionId}/events`,
  });
  if (eventsRes.statusCode !== 200) throw new Error("Session events API failed");
  console.log(`✓ GET /v1/sessions/${sampleSessionId}/events -> 200 OK (${eventsRes.json().length} events)`);

  // 9. Test Dashboard static file serving
  console.log("\n[Dashboard Frontend Verification]");
  const dashboardHtmlRes = await app.inject({ method: "GET", url: "/dashboard/" });
  if (dashboardHtmlRes.statusCode !== 200) throw new Error("Dashboard HTML failed to serve");
  if (!dashboardHtmlRes.body.includes("StreamPulse")) {
    throw new Error("Dashboard HTML does not contain StreamPulse");
  }
  console.log(`✓ GET /dashboard/ -> 200 OK (Served React SPA index.html, size: ${dashboardHtmlRes.body.length} bytes)`);

  const rootRedirect = await app.inject({ method: "GET", url: "/" });
  if (rootRedirect.statusCode !== 302) throw new Error("Root redirect failed");
  console.log(`✓ GET / -> 302 Redirect to /dashboard/`);

  await app.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log("\n============================================================");
  console.log("ALL END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY!");
  console.log("============================================================\n");
}

runEndToEndVerification().catch((err) => {
  console.error("E2E Verification Error:", err);
  process.exit(1);
});
