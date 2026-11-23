import type { StreamPulseEvent, EventType, EventData } from "./schema/models.js";

export type Interval = [number, number];

export function measure(intervals: Interval[]): number {
  let sum = 0;
  for (const [s, e] of intervals) {
    if (e > s) sum += e - s;
  }
  return sum;
}

export function clip(intervals: Interval[], start: number, end: number): Interval[] {
  const res: Interval[] = [];
  for (const [s, e] of intervals) {
    const left = Math.max(s, start);
    const right = Math.min(e, end);
    if (right > left) res.push([left, right]);
  }
  return res;
}

export function subtractOne(interval: Interval, cut: Interval): Interval[] {
  const [s, e] = interval;
  const [cs, ce] = cut;
  if (e <= s) return [];
  if (ce <= s || cs >= e || ce <= cs) return [[s, e]];
  const pieces: Interval[] = [];
  if (cs > s) pieces.push([s, cs]);
  if (ce < e) pieces.push([ce, e]);
  return pieces;
}

export function subtractAll(interval: Interval, cuts: Interval[]): Interval[] {
  let pieces: Interval[] = [interval];
  for (const cut of cuts) {
    const nextPieces: Interval[] = [];
    for (const piece of pieces) {
      nextPieces.push(...subtractOne(piece, cut));
    }
    pieces = nextPieces;
  }
  return pieces.filter(([s, e]) => e > s);
}

export function ratioBucket(ratio: number | null): string | null {
  if (ratio === null) return null;
  if (ratio === 0) return "0";
  if (ratio <= 0.01) return "0-1%";
  if (ratio <= 0.03) return "1-3%";
  if (ratio <= 0.1) return "3-10%";
  return ">10%";
}

export interface WebSessionRollup {
  startup_ms: number | null;
  vsf: boolean;
  ebvs: boolean;
  exit_before_start_other: boolean;
  watch_ms: number;
  seek_ms: number;
  rebuffer_ms: number;
  rebuffer_count: number;
  play_time_ms: number;
  rebuffer_ratio: string | null;
  rebuffers_per_hour: string | null;
  rebuffer_bucket: string | null;
  dropped: number;
  rendered: number;
  dropped_frame_ratio: string | null;
  dropped_frame_bucket: string | null;
  avg_bitrate_bps: number | null;
  bitrate_switch_count: number;
  has_first_frame: boolean;
  playback_failure: boolean;
  app_health_kinds: string[];
  crash_or_anr: boolean;
  qoe: string | null;
  clock_regression: boolean;
  seq_gaps: number;
}

export interface QoeWeights {
  startup: number;
  rebuffer: number;
  dropped_frames: number;
  playback_failure: number;
  startup_good_ms: number;
  startup_bad_ms: number;
  rebuffer_ratio_bad: number;
  dropped_frame_ratio_bad: number;
}

export const DEFAULT_WEIGHTS: QoeWeights = {
  startup: 0.3,
  rebuffer: 0.35,
  dropped_frames: 0.15,
  playback_failure: 0.2,
  startup_good_ms: 1000,
  startup_bad_ms: 5000,
  rebuffer_ratio_bad: 0.1,
  dropped_frame_ratio_bad: 0.05,
};

export function computeWebSessionRollup(
  events: StreamPulseEvent[],
  weights: QoeWeights = DEFAULT_WEIGHTS
): WebSessionRollup {
  if (events.length === 0) throw new Error("empty event list");

  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const seqs = new Set(ordered.map((e) => e.seq));
  const maxSeq = ordered[ordered.length - 1].seq;
  let seqGaps = 0;
  for (let i = 0; i <= maxSeq; i++) {
    if (!seqs.has(i)) seqGaps++;
  }

  const comparable = ordered.filter((e) => e.type !== "app_health");
  let clockRegression = false;
  for (let i = 0; i < comparable.length - 1; i++) {
    if (comparable[i + 1].t_mono_ms < comparable[i].t_mono_ms) {
      clockRegression = true;
      break;
    }
  }

  const attempts = new Map<string, StreamPulseEvent[]>();
  const attemptOrder: string[] = [];
  const healthKinds: string[] = [];

  for (const ev of ordered) {
    if (ev.type === "app_health") {
      healthKinds.push((ev.data as { kind: string }).kind);
      continue;
    }
    if (ev.type === "session_start") continue;

    if (!attempts.has(ev.play_id)) {
      attempts.set(ev.play_id, []);
      attemptOrder.push(ev.play_id);
    }
    attempts.get(ev.play_id)!.push(ev);
  }

  const folded = attemptOrder.map((id) => foldAttempt(attempts.get(id)!));
  const hasPlay = folded.some((a) => a.playRequested);
  const hasFirstFrame = folded.some((a) => a.firstFrameSeq !== null);
  const anyError = folded.some((a) => a.anyError);
  const anyFatal = folded.some((a) => a.anyFatal);
  const anyUserExit = folded.some((a) => a.userExit);

  let startup = computeStartup(folded);
  if (startup !== null && startup < 0) {
    clockRegression = true;
    startup = null;
  }

  const firstFrameSeqs = folded.map((a) => a.firstFrameSeq).filter((s): s is number => s !== null);
  const firstFrameSeq = firstFrameSeqs.length > 0 ? Math.min(...firstFrameSeqs) : null;

  const playbackFailure =
    hasFirstFrame &&
    firstFrameSeq !== null &&
    folded.some((a) => a.fatalSeqs.some((s) => s > firstFrameSeq));

  const vsf = hasPlay && !hasFirstFrame && anyFatal;
  const ebvs = hasPlay && !hasFirstFrame && !anyError && anyUserExit;
  const exitOther = hasPlay && !hasFirstFrame && !vsf && !ebvs;

  let watchMs = 0;
  let seekMs = 0;
  let rebufferMs = 0;
  let rebufferCount = 0;
  let playTimeMs = 0;
  let dropped = 0;
  let rendered = 0;
  let switches = 0;
  let bitrateAcc = 0;
  let bitrateMs = 0;

  for (const a of folded) {
    dropped += a.dropped;
    rendered += a.rendered;
    if (a.firstFrameSeq === null || a.watchMs === null) continue;

    watchMs += a.watchMs;
    seekMs += a.seekMs;
    rebufferMs += a.rebufferMs;
    rebufferCount += a.rebufferCount;
    playTimeMs += a.playTimeMs;
    switches += a.switches;
    bitrateAcc += a.bitrateAcc;
    bitrateMs += a.bitrateMs;
  }

  const rebufferRatio = playTimeMs + rebufferMs > 0 ? rebufferMs / (playTimeMs + rebufferMs) : null;
  const droppedRatio = dropped + rendered > 0 ? dropped / (dropped + rendered) : null;
  const perHour = playTimeMs > 0 ? (rebufferCount * 3600000) / playTimeMs : null;
  const avgBitrate = bitrateMs > 0 ? Math.round(bitrateAcc / bitrateMs) : null;

  let qoe: number | null = null;
  if (hasFirstFrame && startup !== null && !clockRegression) {
    qoe = calculateQoe(startup, rebufferRatio, droppedRatio, playbackFailure, weights);
  }

  return {
    startup_ms: startup,
    vsf,
    ebvs,
    exit_before_start_other: exitOther,
    watch_ms: watchMs,
    seek_ms: seekMs,
    rebuffer_ms: rebufferMs,
    rebuffer_count: rebufferCount,
    play_time_ms: playTimeMs,
    rebuffer_ratio: rebufferRatio !== null ? rebufferRatio.toFixed(6) : null,
    rebuffers_per_hour: perHour !== null ? perHour.toFixed(4) : null,
    rebuffer_bucket: ratioBucket(rebufferRatio),
    dropped,
    rendered,
    dropped_frame_ratio: droppedRatio !== null ? droppedRatio.toFixed(6) : null,
    dropped_frame_bucket: ratioBucket(droppedRatio),
    avg_bitrate_bps: avgBitrate,
    bitrate_switch_count: switches,
    has_first_frame: hasFirstFrame,
    playback_failure: playbackFailure,
    app_health_kinds: healthKinds,
    crash_or_anr: healthKinds.some((k) => k === "crash" || k === "anr" || k === "native_crash"),
    qoe: qoe !== null ? qoe.toFixed(2) : null,
    clock_regression: clockRegression,
    seq_gaps: seqGaps,
  };
}

interface FoldedAttempt {
  playRequested: boolean;
  playRequestedAt: number | null;
  playRequestedSeq: number | null;
  firstFrameSeq: number | null;
  firstFrameAt: number | null;
  userExit: boolean;
  anyError: boolean;
  anyFatal: boolean;
  fatalSeqs: number[];
  dropped: number;
  rendered: number;
  watchMs: number | null;
  seekMs: number;
  rebufferMs: number;
  rebufferCount: number;
  playTimeMs: number;
  switches: number;
  bitrateAcc: number;
  bitrateMs: number;
}

function foldAttempt(events: StreamPulseEvent[]): FoldedAttempt {
  const endIdx = events.findIndex((e) => e.type === "playback_end");
  const considered = endIdx === -1 ? events : events.slice(0, endIdx + 1);

  let playRequestedAt: number | null = null;
  let playRequestedSeq: number | null = null;
  let firstFrameAt: number | null = null;
  let firstFrameSeq: number | null = null;
  let endAtMs: number | null = null;
  let userExit = false;
  let anyError = false;
  let anyFatal = false;
  const fatalSeqs: number[] = [];
  const buffers: Interval[] = [];
  const seeks: Interval[] = [];
  let openBuffer: number | null = null;
  let openSeek: number | null = null;
  const qualities: [number, number][] = [];
  let dropped = 0;
  let rendered = 0;

  for (const ev of considered) {
    const kind = ev.type;
    const at = ev.t_mono_ms;

    if (kind === "play_requested" && playRequestedAt === null) {
      playRequestedAt = at;
      playRequestedSeq = ev.seq;
    } else if (kind === "first_frame" && firstFrameAt === null) {
      firstFrameAt = at;
      firstFrameSeq = ev.seq;
    } else if (kind === "buffering_start" && openBuffer === null) {
      openBuffer = at;
    } else if (kind === "buffering_end" && openBuffer !== null) {
      if (at >= openBuffer) buffers.push([openBuffer, at]);
      openBuffer = null;
    } else if (kind === "seek_start" && openSeek === null) {
      openSeek = at;
    } else if (kind === "seek_end" && openSeek !== null) {
      if (at >= openSeek) seeks.push([openSeek, at]);
      openSeek = null;
    } else if (kind === "quality_change") {
      const data = ev.data as { bitrate_bps: number };
      qualities.push([at, data.bitrate_bps]);
    } else if (kind === "dropped_frames") {
      const data = ev.data as { dropped: number; rendered: number };
      dropped += data.dropped;
      rendered += data.rendered;
    } else if (kind === "playback_error") {
      anyError = true;
      const data = ev.data as { fatal: boolean };
      if (data.fatal) {
        anyFatal = true;
        fatalSeqs.push(ev.seq);
      }
    } else if (kind === "playback_end") {
      endAtMs = at;
      const data = ev.data as { reason: string };
      userExit = data.reason === "user_exit";
    }
  }

  const base: FoldedAttempt = {
    playRequested: playRequestedAt !== null,
    playRequestedAt,
    playRequestedSeq,
    firstFrameSeq,
    firstFrameAt,
    userExit,
    anyError,
    anyFatal,
    fatalSeqs,
    dropped,
    rendered,
    watchMs: null,
    seekMs: 0,
    rebufferMs: 0,
    rebufferCount: 0,
    playTimeMs: 0,
    switches: 0,
    bitrateAcc: 0,
    bitrateMs: 0,
  };

  if (firstFrameAt === null) return base;

  const timelineEnd = endAtMs !== null ? endAtMs : considered[considered.length - 1].t_mono_ms;
  if (timelineEnd < firstFrameAt) return base;

  if (openBuffer !== null && timelineEnd >= openBuffer) {
    buffers.push([openBuffer, timelineEnd]);
  }
  if (openSeek !== null && timelineEnd >= openSeek) {
    seeks.push([openSeek, timelineEnd]);
  }

  const watch = timelineEnd - firstFrameAt;
  const clippedBuffers = clip(buffers, firstFrameAt, timelineEnd);
  const clippedSeeks = clip(seeks, firstFrameAt, timelineEnd);

  let rebufferCount = 0;
  const rebufferPieces: Interval[] = [];
  for (const interval of clippedBuffers) {
    const pieces = subtractAll(interval, clippedSeeks);
    if (measure(pieces) > 0) {
      rebufferCount++;
      rebufferPieces.push(...pieces);
    }
  }

  const rebuffer = measure(rebufferPieces);
  const seek = measure(clippedSeeks);
  const play = Math.max(0, watch - seek - rebuffer);

  const [switches, bitrateAcc, bitrateMs] = computeBitrate(qualities, firstFrameAt, timelineEnd);

  return {
    ...base,
    watchMs: watch,
    seekMs: seek,
    rebufferMs: rebuffer,
    rebufferCount,
    playTimeMs: play,
    switches,
    bitrateAcc,
    bitrateMs,
  };
}

function computeBitrate(qualities: [number, number][], start: number, end: number): [number, number, number] {
  const initial = qualities.filter(([at]) => at <= start).map(([, rate]) => rate);
  let current = initial.length > 0 ? initial[initial.length - 1] : null;
  let switches = 0;
  let cursor = start;
  let accumulated = 0;
  let accumulatedMs = 0;

  for (const [at, bitrate] of qualities) {
    if (at <= start || at > end) continue;
    if (current !== null && at > cursor) {
      accumulated += current * (at - cursor);
      accumulatedMs += at - cursor;
    }
    if (current === null) {
      current = bitrate;
    } else {
      switches++;
      current = bitrate;
    }
    cursor = at;
  }

  if (current !== null && end > cursor) {
    accumulated += current * (end - cursor);
    accumulatedMs += end - cursor;
  }

  return [switches, accumulated, accumulatedMs];
}

function computeStartup(folded: FoldedAttempt[]): number | null {
  const successful = folded.filter((i) => i.playRequestedAt !== null && i.firstFrameAt !== null);
  if (successful.length === 0) return null;

  successful.sort((a, b) => {
    if (a.playRequestedAt! !== b.playRequestedAt!) {
      return a.playRequestedAt! - b.playRequestedAt!;
    }
    return (a.playRequestedSeq ?? 0) - (b.playRequestedSeq ?? 0);
  });

  const chosen = successful[0];
  return chosen.firstFrameAt! - chosen.playRequestedAt!;
}

function calculateQoe(
  startupMs: number,
  rebufferRatio: number | null,
  droppedRatio: number | null,
  playbackFailure: boolean,
  weights: QoeWeights
): number {
  const startupScore = computeStartupScore(startupMs, weights);
  const rebufferScore = computePenaltyScore(rebufferRatio, weights.rebuffer_ratio_bad);
  const droppedScore = computePenaltyScore(droppedRatio, weights.dropped_frame_ratio_bad);
  const failureScore = playbackFailure ? 0 : 100;

  return (
    weights.startup * startupScore +
    weights.rebuffer * rebufferScore +
    weights.dropped_frames * droppedScore +
    weights.playback_failure * failureScore
  );
}

function computeStartupScore(startupMs: number, weights: QoeWeights): number {
  if (startupMs <= weights.startup_good_ms) return 100;
  if (startupMs >= weights.startup_bad_ms) return 0;
  return (100 * (weights.startup_bad_ms - startupMs)) / (weights.startup_bad_ms - weights.startup_good_ms);
}

function computePenaltyScore(ratio: number | null, badRatio: number): number {
  if (ratio === null) return 100;
  const penalty = Math.min(1.0, ratio / badRatio);
  return 100 * (1.0 - penalty);
}

// Session State Machine for Web Player tracking
export class WebSessionStateMachine {
  private seq = 0;
  private hasFirstFrame = false;
  private isBuffering = false;
  private isSeeking = false;
  private isEnded = false;

  constructor(
    public readonly sessionId: string,
    public readonly playId: string,
    private readonly metadata: Record<string, unknown>,
    private readonly onEvent: (event: StreamPulseEvent) => void
  ) {
    this.emit("session_start", {
      content_id: (metadata.contentId as string) || "unknown",
      content_id_hashed: Boolean(metadata.contentIdHashed),
      stream_type: (metadata.streamType as "vod" | "live") || "vod",
      protocol: (metadata.protocol as "hls" | "dash" | "progressive") || "hls",
      player: {
        name: (metadata.playerName as string) || "HTMLVideoElement",
        version: (metadata.playerVersion as string) || "1.0.0",
      },
      cdn: metadata.cdn as string | undefined,
    });
  }

  onPlayRequested() {
    if (this.isEnded) return;
    this.emit("play_requested", {});
  }

  onFirstFrame() {
    if (this.isEnded || this.hasFirstFrame) return;
    this.hasFirstFrame = true;
    this.emit("first_frame", {});
  }

  onBufferingStart() {
    if (this.isEnded || this.isBuffering) return;
    this.isBuffering = true;
    this.emit("buffering_start", {});
  }

  onBufferingEnd() {
    if (this.isEnded || !this.isBuffering) return;
    this.isBuffering = false;
    this.emit("buffering_end", {});
  }

  onSeekStart(fromMs: number, toMs: number) {
    if (this.isEnded || this.isSeeking) return;
    this.isSeeking = true;
    this.emit("seek_start", { from_ms: fromMs, to_ms: toMs });
  }

  onSeekEnd() {
    if (this.isEnded || !this.isSeeking) return;
    this.isSeeking = false;
    this.emit("seek_end", {});
  }

  onQualityChange(bitrateBps: number, width: number, height: number) {
    if (this.isEnded) return;
    this.emit("quality_change", { bitrate_bps: bitrateBps, width, height });
  }

  onDroppedFrames(dropped: number, rendered: number) {
    if (this.isEnded) return;
    this.emit("dropped_frames", { dropped, rendered });
  }

  onError(code: string, fatal: boolean, message: string) {
    if (this.isEnded) return;
    this.emit("playback_error", { code, fatal, message });
    if (fatal) {
      this.end("error");
    }
  }

  onHeartbeat(posMs: number, bufMs: number, dropTotal: number, rendTotal: number) {
    if (this.isEnded) return;
    this.emit("heartbeat", {
      position_ms: posMs,
      buffered_ms: bufMs,
      dropped_total: dropTotal,
      rendered_total: rendTotal,
    });
  }

  end(reason: "ended" | "user_exit" | "error" | "background" = "ended") {
    if (this.isEnded) return;
    this.isEnded = true;
    if (this.isBuffering) this.onBufferingEnd();
    if (this.isSeeking) this.onSeekEnd();
    this.emit("playback_end", { reason });
  }

  private emit(type: EventType, data: EventData) {
    const tMono = typeof performance !== "undefined" ? Math.round(performance.now()) : Date.now();
    const tWall = new Date().toISOString();

    const ev: StreamPulseEvent = {
      type,
      session_id: this.sessionId,
      play_id: this.playId,
      seq: this.seq++,
      t_mono_ms: tMono,
      t_wall: tWall,
      data,
    };
    this.onEvent(ev);
  }
}
