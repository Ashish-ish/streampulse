import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamPulse, ReactNativeVideoAdapter } from "../src/index.js";
import { setMockNativeStreamPulse, Spec } from "../src/specs/NativeStreamPulse.js";

describe("React Native TurboModule and Video Adapter", () => {
  let mockNative: Spec;
  let emittedEvents: Array<{ sessionId: string; type: string; data: any }>;

  beforeEach(() => {
    emittedEvents = [];
    mockNative = {
      initialize: vi.fn(),
      createSession: vi.fn().mockReturnValue("rn-session-123"),
      emitEvent: vi.fn((sessionId, type, dataJson) => {
        emittedEvents.push({ sessionId, type, data: JSON.parse(dataJson) });
      }),
      releaseSession: vi.fn(),
      setEnabled: vi.fn(),
      flush: vi.fn().mockResolvedValue(true),
    };
    setMockNativeStreamPulse(mockNative);
  });

  it("initializes SDK with config", () => {
    StreamPulse.init({
      endpoint: "http://localhost:3000",
      appId: "com.test.rn",
      sampleRate: 0.5,
    });

    expect(mockNative.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "http://localhost:3000",
        appId: "com.test.rn",
        sampleRate: 0.5,
      })
    );
  });

  it("attaches adapter and processes react-native-video lifecycle events", () => {
    const adapter = new ReactNativeVideoAdapter();
    const session = StreamPulse.attach(null, adapter, {
      contentId: "rn_video_42",
      streamType: "vod",
      protocol: "hls",
    });

    expect(session.sessionId).toBe("rn-session-123");
    const videoProps = adapter.getVideoProps();

    // 1. Play requested
    videoProps.onLoadStart({ isNetwork: true, type: "m3u8", uri: "http://stream.m3u8" });
    expect(emittedEvents.some((e) => e.type === "play_requested")).toBe(true);

    // 2. First frame
    videoProps.onReadyForDisplay();
    expect(emittedEvents.some((e) => e.type === "first_frame")).toBe(true);

    // 3. Buffering start & end
    videoProps.onBuffer({ isBuffering: true });
    expect(emittedEvents.some((e) => e.type === "buffering_start")).toBe(true);

    videoProps.onBuffer({ isBuffering: false });
    expect(emittedEvents.some((e) => e.type === "buffering_end")).toBe(true);

    // 4. Bandwidth / bitrate update
    videoProps.onBandwidthUpdate({ bitrate: 3_500_000, width: 1920, height: 1080 });
    const qualityEvent = emittedEvents.find((e) => e.type === "quality_change");
    expect(qualityEvent).toBeDefined();
    expect(qualityEvent?.data.bitrate_bps).toBe(3_500_000);
    expect(qualityEvent?.data.width).toBe(1920);

    // 5. Seek
    videoProps.onSeek();
    expect(emittedEvents.some((e) => e.type === "seek_end")).toBe(true);

    // 6. Playback End
    videoProps.onEnd();
    expect(emittedEvents.some((e) => e.type === "playback_end")).toBe(true);
    expect(mockNative.releaseSession).toHaveBeenCalledWith("rn-session-123");
  });

  it("handles playback error correctly", () => {
    const adapter = new ReactNativeVideoAdapter();
    StreamPulse.attach(null, adapter);
    const videoProps = adapter.getVideoProps();

    videoProps.onError({
      error: { code: 4004, errorString: "Failed to open video source" },
    });

    const errEvent = emittedEvents.find((e) => e.type === "playback_error");
    expect(errEvent).toBeDefined();
    expect(errEvent?.data.code).toBe(4004);
    expect(errEvent?.data.fatal).toBe(true);
    expect(errEvent?.data.message).toBe("Failed to open video source");
  });

  it("flushes and sets enabled status", async () => {
    StreamPulse.setEnabled(false);
    expect(mockNative.setEnabled).toHaveBeenCalledWith(false);

    const flushed = await StreamPulse.flush();
    expect(flushed).toBe(true);
    expect(mockNative.flush).toHaveBeenCalled();
  });
});
