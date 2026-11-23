import type { WebSessionStateMachine } from "../session.js";

export class HTMLVideoElementAdapter {
  private element: HTMLVideoElement | null = null;
  private session: WebSessionStateMachine | null = null;
  private lastDroppedTotal = 0;
  private lastRenderedTotal = 0;
  private dropIntervalId: ReturnType<typeof setInterval> | null = null;

  attach(video: HTMLVideoElement, session: WebSessionStateMachine): void {
    this.element = video;
    this.session = session;

    video.addEventListener("play", this.handlePlay);
    video.addEventListener("playing", this.handlePlaying);
    video.addEventListener("waiting", this.handleWaiting);
    video.addEventListener("seeking", this.handleSeeking);
    video.addEventListener("seeked", this.handleSeeked);
    video.addEventListener("ended", this.handleEnded);
    video.addEventListener("error", this.handleError);

    // Dropped frames poller (zero allocation per frame)
    this.dropIntervalId = setInterval(() => this.pollDroppedFrames(), 2000);

    if (!video.paused) {
      session.onPlayRequested();
    }
  }

  detach(): void {
    if (!this.element) return;
    const v = this.element;
    v.removeEventListener("play", this.handlePlay);
    v.removeEventListener("playing", this.handlePlaying);
    v.removeEventListener("waiting", this.handleWaiting);
    v.removeEventListener("seeking", this.handleSeeking);
    v.removeEventListener("seeked", this.handleSeeked);
    v.removeEventListener("ended", this.handleEnded);
    v.removeEventListener("error", this.handleError);

    if (this.dropIntervalId) clearInterval(this.dropIntervalId);
    this.element = null;
    this.session = null;
  }

  private handlePlay = () => {
    this.session?.onPlayRequested();
  };

  private handlePlaying = () => {
    this.session?.onFirstFrame();
    this.session?.onBufferingEnd();
  };

  private handleWaiting = () => {
    this.session?.onBufferingStart();
  };

  private handleSeeking = () => {
    if (this.element) {
      this.session?.onSeekStart(Math.round(this.element.currentTime * 1000), 0);
    }
  };

  private handleSeeked = () => {
    this.session?.onSeekEnd();
  };

  private handleEnded = () => {
    this.session?.end("ended");
  };

  private handleError = () => {
    const code = this.element?.error ? `MEDIA_ERR_${this.element.error.code}` : "UNKNOWN_ERROR";
    const msg = this.element?.error?.message || "Playback error";
    this.session?.onError(code, true, msg);
  };

  private pollDroppedFrames(): void {
    if (!this.element || !this.session) return;
    // Standard W3C HTMLVideoElement.getVideoPlaybackQuality API
    if (typeof (this.element as any).getVideoPlaybackQuality === "function") {
      const q = (this.element as any).getVideoPlaybackQuality();
      const currentDropped = q.droppedVideoFrames ?? 0;
      const currentTotal = q.totalVideoFrames ?? 0;
      const currentRendered = Math.max(0, currentTotal - currentDropped);

      const deltaDropped = currentDropped - this.lastDroppedTotal;
      const deltaRendered = currentRendered - this.lastRenderedTotal;

      if (deltaDropped > 0 || deltaRendered > 0) {
        this.session.onDroppedFrames(deltaDropped, deltaRendered);
        this.lastDroppedTotal = currentDropped;
        this.lastRenderedTotal = currentRendered;
      }
    }
  }
}

export { HTMLVideoElementAdapter as VideoElementAdapter };
