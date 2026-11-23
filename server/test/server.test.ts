import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { buildServer } from "../src/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "../../spec/fixtures");

describe("StreamPulse Server & Analytics API", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildServer({ inMemoryDb: true });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns health check status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/health",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime_seconds).toBe("number");
  });

  it("ingests nominal golden batch and returns 202 with Date header", async () => {
    const fixturePath = path.join(FIXTURES_DIR, "golden-nominal-playback.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    const res = await app.inject({
      method: "POST",
      url: "/v1/batches",
      headers: { "content-type": "application/json" },
      payload: fixture.batch,
    });

    expect(res.statusCode).toBe(202);
    expect(res.headers["date"]).toBeDefined();
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.batch_id).toBe(fixture.batch.batch_id);
    expect(body.events_inserted).toBe(fixture.batch.events.length);
  });

  it("enforces batch_id idempotency", async () => {
    const fixturePath = path.join(FIXTURES_DIR, "golden-nominal-playback.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    const res1 = await app.inject({
      method: "POST",
      url: "/v1/batches",
      payload: fixture.batch,
    });
    expect(res1.statusCode).toBe(202);

    const res2 = await app.inject({
      method: "POST",
      url: "/v1/batches",
      payload: fixture.batch,
    });
    expect(res2.statusCode).toBe(202);
    const body = res2.json();
    expect(body.deduplicated).toBe(true);
    expect(body.events_inserted).toBe(0);
  });

  it("rejects invalid batch schema with 400 Bad Request", async () => {
    const badBatch = {
      schema_version: "1.0",
      batch_id: "not-a-uuid",
      events: [],
    };

    const res = await app.inject({
      method: "POST",
      url: "/v1/batches",
      payload: badBatch,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("Bad Request");
  });

  it("ignores unknown event types and increments counter", async () => {
    const fixturePath = path.join(FIXTURES_DIR, "golden-nominal-playback.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    const batchWithUnknown = JSON.parse(JSON.stringify(fixture.batch));
    batchWithUnknown.batch_id = "b0000000-0000-4000-8000-999999999999";
    batchWithUnknown.events.push({
      type: "experimental_custom_event",
      session_id: batchWithUnknown.events[0].session_id,
      play_id: batchWithUnknown.events[0].play_id,
      seq: 99,
      t_mono_ms: 50000,
      t_wall: "2026-11-23T12:00:50.000Z",
      data: { foo: "bar" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/batches",
      payload: batchWithUnknown,
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.unknown_events_dropped).toBe(1);

    const health = await app.inject({ method: "GET", url: "/v1/health" });
    expect(health.json().unknown_events_dropped).toBeGreaterThanOrEqual(1);
  });

  it("handles gzip compressed batch payloads", async () => {
    const fixturePath = path.join(FIXTURES_DIR, "golden-nominal-playback.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const batch = JSON.parse(JSON.stringify(fixture.batch));
    batch.batch_id = "b0000000-0000-4000-8000-888888888888";

    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(batch), "utf-8"));

    const res = await app.inject({
      method: "POST",
      url: "/v1/batches",
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      payload: compressed,
    });

    expect(res.statusCode).toBe(202);
    expect(res.json().batch_id).toBe(batch.batch_id);
  });

  it("ingests all golden fixtures and verifies computed metrics match fixture expectations", async () => {
    const fixtureFiles = fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => f.startsWith("golden-") && f.endsWith(".json"));

    for (const file of fixtureFiles) {
      const fixture = JSON.parse(
        fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8")
      );
      const res = await app.inject({
        method: "POST",
        url: "/v1/batches",
        payload: fixture.batch,
      });
      expect(res.statusCode).toBe(202);

      const sessionId = fixture.batch.events[0].session_id;
      const detailRes = await app.inject({
        method: "GET",
        url: `/v1/sessions/${sessionId}`,
      });
      expect(detailRes.statusCode).toBe(200);
      const detail = detailRes.json();
      const session = detail.session;

      // Check key metric parity against oracle
      const expected = fixture.expected;
      if (expected.startup_ms !== null) {
        expect(session.startup_ms).toBe(expected.startup_ms);
      }
      expect(Boolean(session.vsf)).toBe(expected.vsf);
      expect(Boolean(session.ebvs)).toBe(expected.ebvs);
      expect(session.rebuffer_ms).toBe(expected.rebuffer_ms);
      expect(session.rebuffer_count).toBe(expected.rebuffer_count);
      if (expected.qoe !== null) {
        expect(Number(session.qoe).toFixed(2)).toBe(expected.qoe);
      }

      // Check waterfall ordering
      expect(detail.waterfall.length).toBe(fixture.batch.events.length);
      for (let i = 0; i < detail.waterfall.length; i++) {
        expect(detail.waterfall[i].seq).toBe(i);
      }
    }

    // Verify analytics queries with all sessions ingested
    const summaryRes = await app.inject({ method: "GET", url: "/v1/metrics/summary" });
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json();
    expect(summary.total_sessions).toBeGreaterThanOrEqual(1);

    const corrRes = await app.inject({ method: "GET", url: "/v1/metrics/correlation?dimension=rebuffer" });
    expect(corrRes.statusCode).toBe(200);
    const buckets = corrRes.json();
    expect(buckets.length).toBe(5);

    const sessionsRes = await app.inject({ method: "GET", url: "/v1/sessions?limit=10" });
    expect(sessionsRes.statusCode).toBe(200);
    expect(sessionsRes.json().sessions.length).toBeGreaterThanOrEqual(1);
  });
});
