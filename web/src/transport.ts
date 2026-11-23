import type { StreamPulseBatch } from "./schema/models.js";

export class WebTransport {
  private clockSkewDeltaMs = 0;

  constructor(public readonly endpoint: string) {}

  async sendBatch(batch: StreamPulseBatch): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/v1/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (res.headers.has("Date")) {
        const serverDate = new Date(res.headers.get("Date")!).getTime();
        if (!isNaN(serverDate)) {
          this.clockSkewDeltaMs = serverDate - Date.now();
        }
      }

      return res.status === 202;
    } catch {
      return false;
    }
  }

  // Guaranteed flush on page unload / hide
  sendBeaconBatch(batch: StreamPulseBatch): boolean {
    const url = `${this.endpoint}/v1/batches`;
    const payload = JSON.stringify(batch);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return true;
    }

    if (typeof fetch === "function") {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
      return true;
    }

    return false;
  }

  getAdjustedWallClockIso(): string {
    return new Date(Date.now() + this.clockSkewDeltaMs).toISOString();
  }
}
