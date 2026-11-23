import type { WebSessionStateMachine } from "../session.js";

export class HlsJsAdapter {
  private hls: any = null;
  private session: WebSessionStateMachine | null = null;

  attach(hlsInstance: any, session: WebSessionStateMachine): void {
    this.hls = hlsInstance;
    this.session = session;

    if (!hlsInstance || typeof hlsInstance.on !== "function") return;

    hlsInstance.on("hlsLevelSwitched", (_: string, data: any) => {
      const level = hlsInstance.levels?.[data.level];
      if (level) {
        session.onQualityChange(level.bitrate ?? 0, level.width ?? 0, level.height ?? 0);
      }
    });

    hlsInstance.on("hlsError", (_: string, data: any) => {
      if (data.fatal) {
        session.onError(data.details || "HLS_FATAL_ERROR", true, data.error?.message || "HLS error");
      }
    });
  }

  detach(): void {
    this.hls = null;
    this.session = null;
  }
}
