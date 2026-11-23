import type { StreamPulseEvent } from "./schema/models.js";

const CRITICAL_TYPES = new Set(["app_health", "playback_end"]);

export class WebEventQueue {
  private buffer: StreamPulseEvent[] = [];
  private estimatedBytes = 0;

  constructor(
    public readonly maxEvents: number = 5000,
    public readonly maxBytes: number = 5_000_000
  ) {}

  enqueue(event: StreamPulseEvent): void {
    const size = this.estimateSize(event);

    while (
      this.buffer.length >= this.maxEvents ||
      (this.estimatedBytes + size > this.maxBytes && this.buffer.length > 0)
    ) {
      // Evict oldest non-critical event first
      const dropIndex = this.buffer.findIndex((e) => !CRITICAL_TYPES.has(e.type));
      if (dropIndex !== -1) {
        const removed = this.buffer.splice(dropIndex, 1)[0];
        this.estimatedBytes -= this.estimateSize(removed);
      } else {
        const removed = this.buffer.shift()!;
        this.estimatedBytes -= this.estimateSize(removed);
      }
    }

    this.buffer.push(event);
    this.estimatedBytes += size;
  }

  peek(count: number): StreamPulseEvent[] {
    return this.buffer.slice(0, count);
  }

  remove(events: StreamPulseEvent[]): void {
    for (const ev of events) {
      const idx = this.buffer.findIndex(
        (e) => e.session_id === ev.session_id && e.seq === ev.seq
      );
      if (idx !== -1) {
        const removed = this.buffer.splice(idx, 1)[0];
        this.estimatedBytes -= this.estimateSize(removed);
      }
    }
  }

  clear(): void {
    this.buffer = [];
    this.estimatedBytes = 0;
  }

  size(): number {
    return this.buffer.length;
  }

  private estimateSize(ev: StreamPulseEvent): number {
    return 128 + ev.type.length + JSON.stringify(ev.data).length;
  }
}
