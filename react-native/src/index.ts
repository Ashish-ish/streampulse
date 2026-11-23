import { getNativeStreamPulse, NativeConfig, NativeSessionMeta } from "./specs/NativeStreamPulse.js";

export interface StreamPulseConfig {
  endpoint: string;
  appId: string;
  appVersion?: string;
  appBuild?: string;
  sampleRate?: number;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueBytes?: number;
  debug?: boolean;
}

export interface SessionMeta {
  contentId?: string;
  streamType?: "vod" | "live";
  protocol?: "hls" | "dash" | "progressive";
  player?: { name: string; version: string };
  cdn?: string;
}

export interface PlayerListener {
  onPlayRequested(): void;
  onFirstFrame(): void;
  onBufferingStart(): void;
  onBufferingEnd(): void;
  onSeekStart(): void;
  onSeekEnd(): void;
  onQualityChange(bitrateBps: number, width?: number, height?: number): void;
  onDroppedFrames(dropped: number, rendered: number): void;
  onError(code: number, fatal: boolean, message: string): void;
  onPlaybackEnd(reason: "ended" | "user_exit" | "error" | "background"): void;
}

export interface PlayerAdapter {
  attach(listener: PlayerListener): void;
  detach(): void;
}

export class StreamPulseSession implements PlayerListener {
  readonly sessionId: string;
  private adapter: PlayerAdapter | null = null;
  private isReleased = false;

  constructor(sessionId: string, adapter?: PlayerAdapter) {
    this.sessionId = sessionId;
    if (adapter) {
      this.adapter = adapter;
      adapter.attach(this);
    }
  }

  release(): void {
    if (this.isReleased) return;
    this.isReleased = true;
    if (this.adapter) {
      this.adapter.detach();
      this.adapter = null;
    }
    getNativeStreamPulse().releaseSession(this.sessionId);
  }

  private emit(type: string, data: Record<string, unknown> = {}): void {
    if (this.isReleased) return;
    getNativeStreamPulse().emitEvent(this.sessionId, type, JSON.stringify(data));
  }

  onPlayRequested(): void {
    this.emit("play_requested");
  }

  onFirstFrame(): void {
    this.emit("first_frame");
  }

  onBufferingStart(): void {
    this.emit("buffering_start");
  }

  onBufferingEnd(): void {
    this.emit("buffering_end");
  }

  onSeekStart(): void {
    this.emit("seek_start");
  }

  onSeekEnd(): void {
    this.emit("seek_end");
  }

  onQualityChange(bitrateBps: number, width?: number, height?: number): void {
    this.emit("quality_change", {
      bitrate_bps: bitrateBps,
      width,
      height,
    });
  }

  onDroppedFrames(dropped: number, rendered: number): void {
    this.emit("dropped_frames", { dropped, rendered });
  }

  onError(code: number, fatal: boolean, message: string): void {
    this.emit("playback_error", { code, fatal, message });
    if (fatal) {
      this.onPlaybackEnd("error");
    }
  }

  onPlaybackEnd(reason: "ended" | "user_exit" | "error" | "background"): void {
    this.emit("playback_end", { reason });
    this.release();
  }
}

export class StreamPulse {
  private static isInitialized = false;

  static init(config: StreamPulseConfig): void {
    const nativeConfig: NativeConfig = {
      endpoint: config.endpoint,
      appId: config.appId,
      appVersion: config.appVersion ?? "1.0.0",
      appBuild: config.appBuild ?? "1",
      sampleRate: config.sampleRate ?? 1.0,
      flushIntervalMs: config.flushIntervalMs ?? 15000,
      maxBatchSize: config.maxBatchSize ?? 20,
      maxQueueBytes: config.maxQueueBytes ?? 5 * 1024 * 1024,
      debug: config.debug ?? false,
    };
    getNativeStreamPulse().initialize(nativeConfig);
    this.isInitialized = true;
  }

  static attach(
    _player: unknown,
    adapter: PlayerAdapter,
    sessionMeta: SessionMeta = {}
  ): StreamPulseSession {
    const nativeMeta: NativeSessionMeta = {
      contentId: sessionMeta.contentId,
      streamType: sessionMeta.streamType ?? "vod",
      protocol: sessionMeta.protocol ?? "hls",
      playerName: sessionMeta.player?.name ?? "react-native-video",
      playerVersion: sessionMeta.player?.version ?? "6.0",
      cdn: sessionMeta.cdn,
    };

    const sessionId = getNativeStreamPulse().createSession(nativeMeta);
    return new StreamPulseSession(sessionId, adapter);
  }

  static setEnabled(enabled: boolean): void {
    getNativeStreamPulse().setEnabled(enabled);
  }

  static async flush(): Promise<boolean> {
    return await getNativeStreamPulse().flush();
  }
}

export * from "./adapters/react-native-video.js";
