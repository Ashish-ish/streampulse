import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeWebSessionRollup } from "../src/session.js";
import { WebEventQueue } from "../src/queue.js";
import { WebTransport } from "../src/transport.js";
import type { StreamPulseEvent } from "../src/schema/models.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "../../spec/fixtures");

describe("Web SDK Metric Parity & Fixture Verification", () => {
  it("computes identical QoE metrics matching the Python oracle for all golden fixtures", () => {
    const files = fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => f.startsWith("golden-") && f.endsWith(".json"));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8");
      const fixture = JSON.parse(content);

      const events: StreamPulseEvent[] = fixture.batch.events;
      const expected = fixture.expected;

      const rollup = computeWebSessionRollup(events);

      expect(rollup.startup_ms, `${file} startup_ms`).toBe(expected.startup_ms);
      expect(rollup.vsf, `${file} vsf`).toBe(expected.vsf);
      expect(rollup.ebvs, `${file} ebvs`).toBe(expected.ebvs);
      expect(rollup.rebuffer_ms, `${file} rebuffer_ms`).toBe(expected.rebuffer_ms);
      expect(rollup.rebuffer_count, `${file} rebuffer_count`).toBe(expected.rebuffer_count);
      expect(rollup.play_time_ms, `${file} play_time_ms`).toBe(expected.play_time_ms);
      expect(rollup.rebuffer_ratio, `${file} rebuffer_ratio`).toBe(expected.rebuffer_ratio);
      expect(rollup.rebuffer_bucket, `${file} rebuffer_bucket`).toBe(expected.rebuffer_bucket);
      expect(rollup.dropped, `${file} dropped`).toBe(expected.dropped);
      expect(rollup.rendered, `${file} rendered`).toBe(expected.rendered);
      expect(rollup.dropped_frame_ratio, `${file} dropped_frame_ratio`).toBe(expected.dropped_frame_ratio);
      expect(rollup.avg_bitrate_bps, `${file} avg_bitrate_bps`).toBe(expected.avg_bitrate_bps);
      expect(rollup.playback_failure, `${file} playback_failure`).toBe(expected.playback_failure);
      expect(rollup.crash_or_anr, `${file} crash_or_anr`).toBe(expected.crash_or_anr);
      expect(rollup.qoe, `${file} qoe`).toBe(expected.qoe);
    }
  });

  it("prioritizes critical events during queue eviction", () => {
    const queue = new WebEventQueue(3, 10000);

    const makeEv = (seq: number, type: any): StreamPulseEvent => ({
      type,
      session_id: "s1",
      play_id: "p1",
      seq,
      t_mono_ms: seq * 1000,
      t_wall: "2026-11-23T12:00:00.000Z",
      data: {} as any,
    });

    queue.enqueue(makeEv(0, "play_requested"));
    queue.enqueue(makeEv(1, "app_health")); // Critical
    queue.enqueue(makeEv(2, "heartbeat"));

    expect(queue.size()).toBe(3);

    // Enqueue 4th event -> oldest non-critical (seq 0) dropped
    queue.enqueue(makeEv(3, "heartbeat"));
    expect(queue.size()).toBe(3);

    const peeked = queue.peek(3);
    expect(peeked.some((e) => e.type === "app_health")).toBe(true);
    expect(peeked.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("dispatches sendBeaconBatch on pagehide", () => {
    const transport = new WebTransport("http://localhost:3000");

    // Mock navigator.sendBeacon
    const sendBeaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: sendBeaconMock,
      configurable: true,
      writable: true,
    });

    const batch = {
      schema_version: "1.0",
      batch_id: "b0000000-0000-4000-8000-000000000001",
      sent_at: "2026-11-23T12:00:00.000Z",
      sdk: { name: "streampulse-web", version: "0.1.0" },
      app: { id: "test", version: "1.0.0", build: "1" },
      device: { install_id: "d0000000-0000-4000-8000-000000000001", platform: "web", os_version: "mac", model: "Browser", network_type: "wifi" },
      events: [],
    } as any;

    const sent = transport.sendBeaconBatch(batch);
    expect(sent).toBe(true);
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
  });
});
