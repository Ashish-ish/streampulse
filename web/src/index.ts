import { WebEventQueue } from "./queue.js";
import { WebTransport } from "./transport.js";
import { WebSessionStateMachine } from "./session.js";
import { isSessionIncluded } from "./sampling.js";
import { HTMLVideoElementAdapter } from "./adapters/video-element.js";
import { HlsJsAdapter } from "./adapters/hls.js";
import type { StreamPulseBatch, SdkInfo, AppInfo, DeviceInfo } from "./schema/models.js";

export interface StreamPulseWebConfig {
  endpoint: string;
  appId: string;
  appVersion?: string;
  appBuild?: string;
  sampleRate?: number;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  debug?: boolean;
}

export interface StreamPulseWebSession {
  sessionId: string;
  release(): void;
}

class StreamPulseInstance {
  private config: StreamPulseWebConfig | null = null;
  private queue = new WebEventQueue();
  private transport: WebTransport | null = null;
  private isEnabled = true;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private installId = "00000000-0000-4000-8000-000000000001";

  init(cfg: StreamPulseWebConfig): void {
    try {
      this.config = {
        appVersion: "1.0.0",
        appBuild: "1",
        sampleRate: 1.0,
        flushIntervalMs: 15000,
        maxBatchSize: 20,
        debug: false,
        ...cfg,
      };
      this.transport = new WebTransport(cfg.endpoint);
      this.installId = this.getOrCreateInstallId();

      this.setupVisibilityListeners();
      this.startFlushTimer();

      if (this.config.debug) {
        console.log(`[StreamPulse Web] Initialized with endpoint ${cfg.endpoint}`);
      }
    } catch (err) {
      this.handleError(err);
    }
  }

  setEnabled(enabled: boolean): void {
    try {
      this.isEnabled = enabled;
      if (!enabled) {
        this.queue.clear();
      }
    } catch (err) {
      this.handleError(err);
    }
  }

  attach(
    videoElement: HTMLVideoElement,
    adapter: HTMLVideoElementAdapter,
    metadata: Record<string, unknown> = {}
  ): StreamPulseWebSession {
    const sessionId = this.generateUuid();
    const playId = this.generateUuid();

    const stateMachine = new WebSessionStateMachine(
      sessionId,
      playId,
      metadata,
      (event) => {
        if (!this.isEnabled) return;
        this.queue.enqueue(event);
        if (this.queue.size() >= (this.config?.maxBatchSize ?? 20)) {
          this.flush();
        }
      }
    );

    adapter.attach(videoElement, stateMachine);

    return {
      sessionId,
      release: () => {
        try {
          adapter.detach();
          stateMachine.end("user_exit");
          this.flush();
        } catch (err) {
          this.handleError(err);
        }
      },
    };
  }

  async flush(): Promise<void> {
    if (!this.isEnabled || !this.transport || !this.config) return;
    const batchSize = this.config.maxBatchSize ?? 20;
    const events = this.queue.peek(batchSize);
    if (events.length === 0) return;

    const batch = this.createBatch(events);
    const ok = await this.transport.sendBatch(batch);
    if (ok) {
      this.queue.remove(events);
    }
  }

  flushBeacon(): void {
    if (!this.isEnabled || !this.transport || !this.config) return;
    const events = this.queue.peek(this.queue.size());
    if (events.length === 0) return;

    const batch = this.createBatch(events);
    const sent = this.transport.sendBeaconBatch(batch);
    if (sent) {
      this.queue.remove(events);
    }
  }

  private createBatch(events: any[]): StreamPulseBatch {
    return {
      schema_version: "1.0",
      batch_id: this.generateUuid(),
      sent_at: this.transport?.getAdjustedWallClockIso() || new Date().toISOString(),
      sdk: {
        name: "streampulse-web",
        version: "0.1.0",
      },
      app: {
        id: this.config?.appId || "web-app",
        version: this.config?.appVersion || "1.0.0",
        build: this.config?.appBuild || "1",
      },
      device: {
        install_id: this.installId,
        platform: "web",
        os_version: typeof navigator !== "undefined" ? navigator.platform : "web",
        model: "Browser",
        network_type: typeof navigator !== "undefined" && (navigator as any).onLine ? "wifi" : "unknown",
      },
      events,
    };
  }

  private setupVisibilityListeners(): void {
    if (typeof window === "undefined") return;

    const onHide = () => {
      this.flushBeacon();
    };

    window.addEventListener("pagehide", onHide);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        onHide();
      }
    });
  }

  private startFlushTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    const interval = this.config?.flushIntervalMs ?? 15000;
    this.flushTimer = setInterval(() => this.flush(), interval);
  }

  private getOrCreateInstallId(): string {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("streampulse_install_id");
      if (stored) return stored;
      const created = this.generateUuid();
      localStorage.setItem("streampulse_install_id", created);
      return created;
    }
    return this.generateUuid();
  }

  private generateUuid(): string {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
    );
  }

  private handleError(err: unknown): void {
    if (this.config?.debug) {
      console.error("[StreamPulse Web Error]", err);
    }
  }
}

export const StreamPulse = new StreamPulseInstance();
export { HTMLVideoElementAdapter, HlsJsAdapter };
export * from "./schema/models.js";
export * from "./session.js";
