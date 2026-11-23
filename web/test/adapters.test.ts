import { describe, it, expect, vi, beforeEach } from "vitest";
import { VideoElementAdapter } from "../src/adapters/video-element.js";
import { HlsJsAdapter } from "../src/adapters/hls.js";
import { scrubMessage } from "../src/scrub.js";
import { isSessionIncluded, sampleThreshold } from "../src/sampling.js";
import { WebSessionStateMachine } from "../src/session.js";

describe("Web Adapters and Core Functionality", () => {
  describe("Scrubber", () => {
    it("redacts URLs and query params", () => {
      const dirty = "Error from https://cdn.com/seg1.mp4?token=secret123 and www.google.com/test";
      const cleaned = scrubMessage(dirty);
      expect(cleaned).not.toContain("secret123");
      expect(cleaned).not.toContain("cdn.com");
      expect(cleaned).toContain("[url]");
    });

    it("truncates to limit and cleans whitespace", () => {
      const longMsg = "   lots   of    spaces   " + "a".repeat(300);
      const cleaned = scrubMessage(longMsg, 50);
      expect(cleaned.length).toBeLessThanOrEqual(50);
      expect(cleaned).not.toContain("   ");
    });
  });

  describe("Sampling", () => {
    it("computes thresholds correctly", () => {
      expect(sampleThreshold(1.0)).toBe(1_000_000);
      expect(sampleThreshold(0.0)).toBe(0);
      expect(sampleThreshold(0.5)).toBe(500_000);
      expect(() => sampleThreshold(-0.1)).toThrow();
      expect(() => sampleThreshold(1.5)).toThrow();
    });

    it("evaluates boundary sample rates correctly", async () => {
      expect(await isSessionIncluded("session-1", 1.0)).toBe(true);
      expect(await isSessionIncluded("session-1", 0.0)).toBe(false);
      expect(await isSessionIncluded("session-2", 1.0)).toBe(true);
      expect(await isSessionIncluded("session-2", 0.0)).toBe(false);
    });
  });

  describe("VideoElementAdapter", () => {
    let mockVideo: any;
    let listeners: Record<string, Function>;

    beforeEach(() => {
      listeners = {};
      mockVideo = {
        paused: true,
        addEventListener: vi.fn((event: string, cb: Function) => {
          listeners[event] = cb;
        }),
        removeEventListener: vi.fn(),
        getVideoPlaybackQuality: vi.fn().mockReturnValue({
          totalVideoFrames: 1000,
          droppedVideoFrames: 10,
        }),
      };
    });

    it("listens to video element events and delegates to session", () => {
      const mockSession = {
        onPlayRequested: vi.fn(),
        onFirstFrame: vi.fn(),
        onBufferingStart: vi.fn(),
        onBufferingEnd: vi.fn(),
        onSeekStart: vi.fn(),
        onSeekEnd: vi.fn(),
        onDroppedFrames: vi.fn(),
        onError: vi.fn(),
        end: vi.fn(),
        onPlaybackEnd: vi.fn(),
        onQualityChange: vi.fn(),
      } as any;

      const adapter = new VideoElementAdapter();
      adapter.attach(mockVideo, mockSession);

      // Play requested
      listeners["play"]();
      expect(mockSession.onPlayRequested).toHaveBeenCalled();

      // First frame
      listeners["playing"]();
      expect(mockSession.onFirstFrame).toHaveBeenCalled();

      // Buffering start
      listeners["waiting"]();
      expect(mockSession.onBufferingStart).toHaveBeenCalled();

      // Buffering end
      listeners["playing"]();
      expect(mockSession.onBufferingEnd).toHaveBeenCalled();

      // Seek
      listeners["seeking"]();
      expect(mockSession.onSeekStart).toHaveBeenCalled();
      listeners["seeked"]();
      expect(mockSession.onSeekEnd).toHaveBeenCalled();

      // End
      listeners["ended"]();
      expect(mockSession.end).toHaveBeenCalledWith("ended");

      // Detach removes listeners
      adapter.detach();
      expect(mockVideo.removeEventListener).toHaveBeenCalled();
    });
  });

  describe("HlsJsAdapter", () => {
    it("handles hlsLevelSwitched and hlsError", () => {
      const hlsListeners: Record<string, Function> = {};
      const mockHls = {
        on: vi.fn((event: string, cb: Function) => {
          hlsListeners[event] = cb;
        }),
        levels: [
          { bitrate: 1_200_000, width: 1280, height: 720 },
          { bitrate: 3_000_000, width: 1920, height: 1080 },
        ],
      };

      const mockSession = {
        onQualityChange: vi.fn(),
        onError: vi.fn(),
      } as any;

      const adapter = new HlsJsAdapter();
      adapter.attach(mockHls, mockSession);

      // Quality change
      hlsListeners["hlsLevelSwitched"]("hlsLevelSwitched", { level: 1 });
      expect(mockSession.onQualityChange).toHaveBeenCalledWith(3_000_000, 1920, 1080);

      // Non-fatal error ignored
      hlsListeners["hlsError"]("hlsError", { fatal: false, details: "BUFFER_STALLED" });
      expect(mockSession.onError).not.toHaveBeenCalled();

      // Fatal error
      hlsListeners["hlsError"]("hlsError", {
        fatal: true,
        details: "NETWORK_ERROR",
        error: new Error("Manifest load failed"),
      });
      expect(mockSession.onError).toHaveBeenCalledWith(
        "NETWORK_ERROR",
        true,
        "Manifest load failed"
      );
    });
  });

  describe("WebSessionStateMachine", () => {
    it("tracks state transitions, heartbeats, and creates proper events", () => {
      const emittedEvents: any[] = [];
      const session = new WebSessionStateMachine(
        "test-web-session",
        "test-web-play",
        {
          contentId: "test-video",
          streamType: "vod",
          protocol: "hls",
          playerName: "HTMLVideoElement",
          playerVersion: "1.0.0",
        },
        (event) => {
          emittedEvents.push(event);
        }
      );

      session.onPlayRequested();
      session.onFirstFrame();
      session.onBufferingStart();
      session.onBufferingEnd();
      session.onDroppedFrames(5, 500);
      session.onQualityChange(2_500_000, 1920, 1080);
      session.onError(4003, true, "Decode error");
      session.onPlaybackEnd("ended");

      expect(emittedEvents.length).toBe(9); // session_start + 8 events
      expect(emittedEvents[0].type).toBe("session_start");
      expect(emittedEvents[1].type).toBe("play_requested");
      expect(emittedEvents[2].type).toBe("first_frame");
      expect(emittedEvents[3].type).toBe("buffering_start");
      expect(emittedEvents[4].type).toBe("buffering_end");
      expect(emittedEvents[5].type).toBe("dropped_frames");
      expect(emittedEvents[6].type).toBe("quality_change");
      expect(emittedEvents[7].type).toBe("playback_error");
      expect(emittedEvents[8].type).toBe("playback_end");
    });
  });
});
