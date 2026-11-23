import { SeededRNG } from "./prng.js";

export interface BatchPayload {
  schema_version: "1.0";
  batch_id: string;
  sent_at: string;
  sdk: {
    name: "streampulse-android" | "streampulse-ios" | "streampulse-web" | "streampulse-react-native";
    version: string;
  };
  app: {
    id: string;
    version: string;
    build: string;
  };
  device: {
    install_id: string;
    platform: "android" | "ios" | "web" | "rn";
    os_version: string;
    model: string;
    network_type: "wifi" | "cellular" | "ethernet" | "none" | "unknown";
  };
  events: Array<{
    type: string;
    session_id: string;
    play_id: string;
    seq: number;
    t_mono_ms: number;
    t_wall: string;
    data: Record<string, unknown>;
  }>;
}

export type ProfileName = "mixed" | "good_wifi" | "congested_cellular" | "flaky_offline";

export function generateSessionBatch(
  rng: SeededRNG,
  profile: ProfileName = "mixed",
  timeOffsetMs: number = 0
): BatchPayload {
  const platforms: Array<"android" | "ios" | "web" | "rn"> = ["android", "ios", "web", "rn"];
  const platform = rng.choice(platforms);

  const sdkName =
    platform === "android"
      ? "streampulse-android"
      : platform === "ios"
      ? "streampulse-ios"
      : platform === "web"
      ? "streampulse-web"
      : "streampulse-react-native";

  const appVersions = ["1.0.0", "1.1.0", "1.2.0"];
  const appVersion = rng.choice(appVersions);

  // Network selection based on profile
  let networkType: "wifi" | "cellular" | "ethernet" = "wifi";
  if (profile === "congested_cellular") {
    networkType = "cellular";
  } else if (profile === "good_wifi") {
    networkType = "wifi";
  } else if (profile === "flaky_offline") {
    networkType = "cellular";
  } else {
    // mixed
    const r = rng.random();
    networkType = r < 0.65 ? "wifi" : r < 0.9 ? "cellular" : "ethernet";
  }

  const deviceModels: Record<string, string[]> = {
    android: ["Pixel 8", "Samsung Galaxy S24", "Xiaomi 14", "OnePlus 12"],
    ios: ["iPhone 15 Pro", "iPhone 14", "iPad Air 5", "iPhone SE 3"],
    web: ["Chrome Mac", "Safari Mac", "Firefox Windows", "Edge Windows"],
    rn: ["Pixel 7a", "iPhone 13", "Galaxy A54"],
  };
  const model = rng.choice(deviceModels[platform]);

  const sessionId = rng.uuid();
  const playId = rng.uuid();
  const installId = rng.uuid();
  const batchId = rng.uuid();

  const now = Date.now() - timeOffsetMs;
  const sessionStartTime = new Date(now).toISOString();

  let tMono = 0;
  let seq = 0;

  const events: BatchPayload["events"] = [];

  const addEvent = (type: string, data: Record<string, unknown>, delayMs: number = 0) => {
    tMono += delayMs;
    const tWall = new Date(now + tMono).toISOString();
    events.push({
      type,
      session_id: sessionId,
      play_id: playId,
      seq: seq++,
      t_mono_ms: tMono,
      t_wall: tWall,
      data,
    });
  };

  // 1. session_start
  addEvent("session_start", {
    content_id: `asset-${rng.range(100, 999)}`,
    content_id_hashed: false,
    stream_type: "vod",
    protocol: platform === "web" ? "hls" : "dash",
    player: {
      name: platform === "android" ? "ExoPlayer" : platform === "ios" ? "AVPlayer" : "hls.js",
      version: "1.0.0",
    },
    cdn: rng.choice(["fastly", "cloudflare", "akamai"]),
  });

  // 2. play_requested
  addEvent("play_requested", {}, rng.range(50, 150));

  // Determine scenario
  const outcomeRand = rng.random();
  const isVsf = outcomeRand < 0.02; // 2% video start failure
  const isEbvs = !isVsf && outcomeRand < 0.05; // 3% exit before video start

  if (isVsf) {
    addEvent("buffering_start", {}, rng.range(100, 300));
    addEvent(
      "playback_error",
      {
        code: "NETWORK_TIMEOUT",
        fatal: true,
        message: "Failed to fetch media segments",
      },
      rng.range(800, 2000)
    );
    addEvent("playback_end", { reason: "error" }, rng.range(50, 100));
  } else if (isEbvs) {
    addEvent("buffering_start", {}, rng.range(100, 200));
    addEvent("playback_end", { reason: "user_exit" }, rng.range(300, 1200));
  } else {
    // Normal playback session
    // Startup time based on network
    const startupDelay =
      networkType === "cellular"
        ? rng.range(800, 2800)
        : profile === "flaky_offline"
        ? rng.range(1500, 4200)
        : rng.range(250, 900);

    const initialBitrate = networkType === "cellular" ? 1500000 : 4000000;
    addEvent(
      "quality_change",
      {
        bitrate_bps: initialBitrate,
        width: initialBitrate > 2000000 ? 1920 : 1280,
        height: initialBitrate > 2000000 ? 1080 : 720,
      },
      Math.floor(startupDelay * 0.3)
    );

    addEvent("first_frame", {}, Math.floor(startupDelay * 0.7));

    // Playback duration: 30s to 180s
    const targetPlayMs = rng.range(30000, 120000);
    let elapsedPlayMs = 0;
    let hasHighRebuffering = false;

    // Determine rebuffering behaviour
    const rebufferChance =
      networkType === "cellular" ? 0.35 : profile === "flaky_offline" ? 0.75 : 0.08;
    const willRebuffer = rng.random() < rebufferChance;

    while (elapsedPlayMs < targetPlayMs) {
      const step = rng.range(8000, 15000);
      elapsedPlayMs += step;

      // Heartbeat event every ~10s
      addEvent(
        "heartbeat",
        {
          position_ms: elapsedPlayMs,
          buffered_ms: elapsedPlayMs + rng.range(5000, 15000),
          dropped_total: rng.range(0, 10),
          rendered_total: Math.floor((elapsedPlayMs / 1000) * 30),
        },
        step
      );

      // Trigger rebuffer episode if planned
      if (willRebuffer && rng.random() < 0.4) {
        const rebufferDuration =
          networkType === "cellular"
            ? rng.range(2000, 6000)
            : profile === "flaky_offline"
            ? rng.range(4000, 12000)
            : rng.range(600, 1800);

        addEvent("buffering_start", {}, rng.range(100, 300));
        addEvent("buffering_end", {}, rebufferDuration);
        if (rebufferDuration > 3000) {
          hasHighRebuffering = true;
        }
      }

      // Dropped frames check
      if (rng.random() < 0.25) {
        const dropped = rng.range(1, 15);
        const rendered = rng.range(200, 450);
        addEvent("dropped_frames", { dropped, rendered }, rng.range(20, 100));
      }
    }

    // Midstream error check (~1.5%)
    if (rng.random() < 0.015) {
      addEvent(
        "playback_error",
        {
          code: "DECODER_CRASH",
          fatal: true,
          message: "MediaCodec video decoder terminated unexpectedly",
        },
        rng.range(100, 500)
      );
      addEvent("playback_end", { reason: "error" }, rng.range(50, 100));
    } else {
      addEvent(
        "playback_end",
        {
          reason: rng.random() < 0.8 ? "ended" : "user_exit",
        },
        rng.range(50, 100)
      );
    }

    // INJECTED CORRELATION:
    // Poor rebuffer sessions (rebuffer ratio > 3% or flaky) have significantly higher crash/ANR probability!
    // Baseline crash rate: 1.2%
    // Elevated crash rate: 18.5%
    const crashProbability = hasHighRebuffering ? 0.185 : 0.012;
    if (rng.random() < crashProbability) {
      const healthKind = rng.choice(["anr", "crash", "native_crash"]);
      addEvent(
        "app_health",
        {
          kind: healthKind,
          occurred_at: new Date(now + tMono + rng.range(100, 1000)).toISOString(),
        },
        rng.range(100, 500)
      );
    }
  }

  return {
    schema_version: "1.0",
    batch_id: batchId,
    sent_at: new Date(now + tMono + 200).toISOString(),
    sdk: {
      name: sdkName,
      version: "0.1.0",
    },
    app: {
      id: "com.streampulse.demo",
      version: appVersion,
      build: "100",
    },
    device: {
      install_id: installId,
      platform,
      os_version: platform === "android" ? "14" : platform === "ios" ? "17.4" : "macOS 14",
      model,
      network_type: networkType,
    },
    events,
  };
}
