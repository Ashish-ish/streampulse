import { PlayerAdapter, PlayerListener } from "../index.js";

export interface RNVLoadStartEvent {
  isNetwork: boolean;
  type: string;
  uri: string;
}

export interface RNVBufferEvent {
  isBuffering: boolean;
}

export interface RNVBandwidthEvent {
  bitrate: number;
  width?: number;
  height?: number;
}

export interface RNVErrorEvent {
  error: {
    code?: number | string;
    domain?: string;
    localizedDescription?: string;
    errorString?: string;
  };
}

export class ReactNativeVideoAdapter implements PlayerAdapter {
  private listener: PlayerListener | null = null;
  private hasReportedFirstFrame = false;
  private isBuffering = false;

  attach(listener: PlayerListener): void {
    this.listener = listener;
  }

  detach(): void {
    this.listener = null;
  }

  /**
   * Generates event handler props to spread directly onto <Video ...adapter.getVideoProps() />
   */
  getVideoProps() {
    return {
      onLoadStart: (_e?: RNVLoadStartEvent) => {
        if (!this.hasReportedFirstFrame) {
          this.listener?.onPlayRequested();
        }
      },
      onReadyForDisplay: () => {
        if (!this.hasReportedFirstFrame) {
          this.hasReportedFirstFrame = true;
          this.listener?.onFirstFrame();
        }
        if (this.isBuffering) {
          this.isBuffering = false;
          this.listener?.onBufferingEnd();
        }
      },
      onBuffer: (e: RNVBufferEvent) => {
        if (e.isBuffering && !this.isBuffering && this.hasReportedFirstFrame) {
          this.isBuffering = true;
          this.listener?.onBufferingStart();
        } else if (!e.isBuffering && this.isBuffering) {
          this.isBuffering = false;
          this.listener?.onBufferingEnd();
        }
      },
      onSeek: () => {
        this.listener?.onSeekEnd();
      },
      onBandwidthUpdate: (e: RNVBandwidthEvent) => {
        if (e.bitrate > 0) {
          this.listener?.onQualityChange(e.bitrate, e.width, e.height);
        }
      },
      onError: (e: RNVErrorEvent) => {
        const code = typeof e.error?.code === "number" ? e.error.code : 1000;
        const msg = e.error?.localizedDescription || e.error?.errorString || "Video playback error";
        this.listener?.onError(code, true, msg);
      },
      onEnd: () => {
        this.listener?.onPlaybackEnd("ended");
      },
    };
  }
}
