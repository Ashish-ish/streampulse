import Foundation

public struct SessionRollup: Equatable, Sendable {
    public let startupMs: Int64?
    public let vsf: Bool
    public let ebvs: Bool
    public let exitBeforeStartOther: Bool
    public let watchMs: Int64
    public let seekMs: Int64
    public let rebufferMs: Int64
    public let rebufferCount: Int
    public let playTimeMs: Int64
    public let rebufferRatio: String?
    public let rebuffersPerHour: String?
    public let rebufferBucket: String?
    public let dropped: Int64
    public let rendered: Int64
    public let droppedFrameRatio: String?
    public let droppedFrameBucket: String?
    public let avgBitrateBps: Int64?
    public let bitrateSwitchCount: Int
    public let hasFirstFrame: Bool
    public let playbackFailure: Bool
    public let appHealthKinds: [String]
    public let crashOrAnr: Bool
    public let qoe: String?
    public let clockRegression: Bool
    public let seqGaps: Int
}

public struct QoeWeights: Equatable, Sendable {
    public let startup: Double
    public let rebuffer: Double
    public let droppedFrames: Double
    public let playbackFailure: Double
    public let startupGoodMs: Int64
    public let startupBadMs: Int64
    public let rebufferRatioBad: Double
    public let droppedFrameRatioBad: Double

    public init(
        startup: Double = 0.30,
        rebuffer: Double = 0.35,
        droppedFrames: Double = 0.15,
        playbackFailure: Double = 0.20,
        startupGoodMs: Int64 = 1000,
        startupBadMs: Int64 = 5000,
        rebufferRatioBad: Double = 0.10,
        droppedFrameRatioBad: Double = 0.05
    ) {
        self.startup = startup
        self.rebuffer = rebuffer
        self.droppedFrames = droppedFrames
        self.playbackFailure = playbackFailure
        self.startupGoodMs = startupGoodMs
        self.startupBadMs = startupBadMs
        self.rebufferRatioBad = rebufferRatioBad
        self.droppedFrameRatioBad = droppedFrameRatioBad
    }
}

public enum MetricFold {
    private static let crashAnrKinds: Set<String> = ["crash", "anr", "native_crash"]
    private static let sessionScoped: Set<String> = ["session_start", "app_health"]

    public static func ratioBucket(_ ratio: Double?) -> String? {
        guard let ratio = ratio else { return nil }
        if ratio == 0.0 { return "0" }
        if ratio <= 0.01 { return "0-1%" }
        if ratio <= 0.03 { return "1-3%" }
        if ratio <= 0.10 { return "3-10%" }
        return ">10%"
    }

    public static func formatFixed(_ value: Double, places: Int) -> String {
        let factor = pow(10.0, Double(places))
        let rounded = Int64((value * factor).rounded())
        let isNegative = rounded < 0
        let absRounded = abs(rounded)
        let str = String(absRounded)
        let padded = String(repeating: "0", count: max(0, places + 1 - str.count)) + str
        let intPart = padded.count > places ? String(padded.prefix(padded.count - places)) : "0"
        let fracPart = String(padded.suffix(places))
        return (isNegative ? "-" : "") + "\(intPart).\(fracPart)"
    }

    public static func compute(events: [StreamPulseEvent], weights: QoeWeights = QoeWeights()) -> SessionRollup {
        precondition(!events.isEmpty, "events cannot be empty")

        let ordered = events.sorted { $0.seq < $1.seq }
        let seqs = Set(ordered.map { $0.seq })
        let lastSeq = ordered.last?.seq ?? 0
        var seqGaps = 0
        for i in 0...lastSeq {
            if !seqs.contains(i) {
                seqGaps += 1
            }
        }

        let comparable = ordered.filter { $0.type != "app_health" }
        var clockRegression = false
        if comparable.count > 1 {
            for i in 0..<(comparable.count - 1) {
                if comparable[i + 1].tMonoMs < comparable[i].tMonoMs {
                    clockRegression = true
                    break
                }
            }
        }

        var attempts: [String: [StreamPulseEvent]] = [:]
        var health: [String] = []

        for ev in ordered {
            if ev.type == "app_health" {
                let kind = ev.data["kind"]?.stringValue ?? ""
                health.append(kind)
                continue
            }
            if sessionScoped.contains(ev.type) {
                continue
            }
            attempts[ev.playId, default: []].append(ev)
        }

        let foldedAttempts = attempts.values.map { foldAttempt($0) }
        let hasPlay = foldedAttempts.contains { $0.playRequested }
        let hasFirstFrame = foldedAttempts.contains { $0.firstFrameSeq != nil }
        let anyError = foldedAttempts.contains { $0.anyError }
        let anyFatal = foldedAttempts.contains { $0.anyFatal }
        let anyUserExit = foldedAttempts.contains { $0.userExit }

        var startup = computeStartup(foldedAttempts)
        if let s = startup, s < 0 {
            clockRegression = true
            startup = nil
        }

        let firstFrameSeq = foldedAttempts.compactMap { $0.firstFrameSeq }.min()
        let playbackFailure = hasFirstFrame && firstFrameSeq != nil && foldedAttempts.contains { attempt in
            attempt.fatalSeqs.contains { $0 > firstFrameSeq! }
        }

        let vsf = hasPlay && !hasFirstFrame && anyFatal
        let ebvs = hasPlay && !hasFirstFrame && !anyError && anyUserExit
        let exitOther = hasPlay && !hasFirstFrame && !vsf && !ebvs

        var watchMs: Int64 = 0
        var seekMs: Int64 = 0
        var rebufferMs: Int64 = 0
        var rebufferCount = 0
        var playTimeMs: Int64 = 0
        var dropped: Int64 = 0
        var rendered: Int64 = 0
        var switches = 0
        var bitrateAcc: Int64 = 0
        var bitrateMs: Int64 = 0

        for a in foldedAttempts {
            dropped += a.dropped
            rendered += a.rendered
            guard a.firstFrameSeq != nil, let w = a.watchMs else { continue }

            watchMs += w
            seekMs += a.seekMs
            rebufferMs += a.rebufferMs
            rebufferCount += a.rebufferCount
            playTimeMs += a.playTimeMs
            switches += a.switches
            bitrateAcc += a.bitrateAcc
            bitrateMs += a.bitrateMs
        }

        let rebufferRatio: Double? = (playTimeMs + rebufferMs > 0) ? Double(rebufferMs) / Double(playTimeMs + rebufferMs) : nil
        let droppedRatio: Double? = (dropped + rendered > 0) ? Double(dropped) / Double(dropped + rendered) : nil
        let rebuffersPerHour: Double? = (playTimeMs > 0) ? (Double(rebufferCount) * 3_600_000.0) / Double(playTimeMs) : nil
        let avgBitrateBps: Int64? = (bitrateMs > 0) ? Int64((Double(bitrateAcc) / Double(bitrateMs)).rounded()) : nil

        let qoe: Double? = (hasFirstFrame && startup != nil && !clockRegression) ? calculateQoe(
            startupMs: startup!,
            rebufferRatio: rebufferRatio,
            droppedRatio: droppedRatio,
            playbackFailure: playbackFailure,
            weights: weights
        ) : nil

        return SessionRollup(
            startupMs: startup,
            vsf: vsf,
            ebvs: ebvs,
            exitBeforeStartOther: exitOther,
            watchMs: watchMs,
            seekMs: seekMs,
            rebufferMs: rebufferMs,
            rebufferCount: rebufferCount,
            playTimeMs: playTimeMs,
            rebufferRatio: rebufferRatio.map { formatFixed($0, places: 6) },
            rebuffersPerHour: rebuffersPerHour.map { formatFixed($0, places: 4) },
            rebufferBucket: ratioBucket(rebufferRatio),
            dropped: dropped,
            rendered: rendered,
            droppedFrameRatio: droppedRatio.map { formatFixed($0, places: 6) },
            droppedFrameBucket: ratioBucket(droppedRatio),
            avgBitrateBps: avgBitrateBps,
            bitrateSwitchCount: switches,
            hasFirstFrame: hasFirstFrame,
            playbackFailure: playbackFailure,
            appHealthKinds: health,
            crashOrAnr: health.contains { crashAnrKinds.contains($0) },
            qoe: qoe.map { formatFixed($0, places: 2) },
            clockRegression: clockRegression,
            seqGaps: seqGaps
        )
    }

    private struct FoldedAttempt {
        let playRequested: Bool
        let playRequestedAt: Int64?
        let playRequestedSeq: Int?
        let firstFrameSeq: Int?
        let firstFrameAt: Int64?
        let userExit: Bool
        let anyError: Bool
        let anyFatal: Bool
        let fatalSeqs: [Int]
        let dropped: Int64
        let rendered: Int64
        let watchMs: Int64?
        let seekMs: Int64
        let rebufferMs: Int64
        let rebufferCount: Int
        let playTimeMs: Int64
        let switches: Int
        let bitrateAcc: Int64
        let bitrateMs: Int64
    }

    private static func foldAttempt(_ events: [StreamPulseEvent]) -> FoldedAttempt {
        let endIdx = events.firstIndex { $0.type == "playback_end" }
        let considered: [StreamPulseEvent]
        if let idx = endIdx {
            considered = Array(events[0...idx])
        } else {
            considered = events
        }

        var playRequestedAt: Int64?
        var playRequestedSeq: Int?
        var firstFrameAt: Int64?
        var firstFrameSeq: Int?
        var endAtMs: Int64?
        var userExit = false
        var anyError = false
        var anyFatal = false
        var fatalSeqs: [Int] = []
        var buffers: [Interval] = []
        var seeks: [Interval] = []
        var openBuffer: Int64?
        var openSeek: Int64?
        var qualities: [(time: Int64, bitrate: Int64)] = []
        var dropped: Int64 = 0
        var rendered: Int64 = 0

        for ev in considered {
            let at = ev.tMonoMs
            switch ev.type {
            case "play_requested":
                if playRequestedAt == nil {
                    playRequestedAt = at
                    playRequestedSeq = ev.seq
                }
            case "first_frame":
                if firstFrameAt == nil {
                    firstFrameAt = at
                    firstFrameSeq = ev.seq
                }
            case "buffering_start":
                if openBuffer == nil { openBuffer = at }
            case "buffering_end":
                if let b = openBuffer {
                    if at >= b { buffers.append(Interval(b, at)) }
                    openBuffer = nil
                }
            case "seek_start":
                if openSeek == nil { openSeek = at }
            case "seek_end":
                if let s = openSeek {
                    if at >= s { seeks.append(Interval(s, at)) }
                    openSeek = nil
                }
            case "quality_change":
                let rate = ev.data["bitrate_bps"]?.int64Value ?? 0
                qualities.append((time: at, bitrate: rate))
            case "dropped_frames":
                dropped += ev.data["dropped"]?.int64Value ?? 0
                rendered += ev.data["rendered"]?.int64Value ?? 0
            case "playback_error":
                anyError = true
                let fatal = ev.data["fatal"]?.boolValue ?? false
                if fatal {
                    anyFatal = true
                    fatalSeqs.append(ev.seq)
                }
            case "playback_end":
                endAtMs = at
                let reason = ev.data["reason"]?.stringValue
                userExit = (reason == "user_exit")
            default:
                break
            }
        }

        let base = FoldedAttempt(
            playRequested: playRequestedAt != nil,
            playRequestedAt: playRequestedAt,
            playRequestedSeq: playRequestedSeq,
            firstFrameSeq: firstFrameSeq,
            firstFrameAt: firstFrameAt,
            userExit: userExit,
            anyError: anyError,
            anyFatal: anyFatal,
            fatalSeqs: fatalSeqs,
            dropped: dropped,
            rendered: rendered,
            watchMs: nil,
            seekMs: 0,
            rebufferMs: 0,
            rebufferCount: 0,
            playTimeMs: 0,
            switches: 0,
            bitrateAcc: 0,
            bitrateMs: 0
        )

        guard let firstFrame = firstFrameAt else { return base }

        let timelineEnd = endAtMs ?? considered.last?.tMonoMs ?? firstFrame
        if timelineEnd < firstFrame { return base }

        if let b = openBuffer, timelineEnd >= b {
            buffers.append(Interval(b, timelineEnd))
        }
        if let s = openSeek, timelineEnd >= s {
            seeks.append(Interval(s, timelineEnd))
        }

        let watch = timelineEnd - firstFrame
        let clippedBuffers = IntervalMath.clip(buffers, start: firstFrame, end: timelineEnd)
        let clippedSeeks = IntervalMath.clip(seeks, start: firstFrame, end: timelineEnd)

        var rebufferCount = 0
        var rebufferPieces: [Interval] = []
        for interval in clippedBuffers {
            let pieces = IntervalMath.subtractAll(interval: interval, cuts: clippedSeeks)
            if IntervalMath.measure(pieces) > 0 {
                rebufferCount += 1
                rebufferPieces.append(contentsOf: pieces)
            }
        }

        let rebuffer = IntervalMath.measure(rebufferPieces)
        let seek = IntervalMath.measure(clippedSeeks)
        let play = max(0, watch - seek - rebuffer)

        let bitrateStats = computeBitrate(qualities: qualities, start: firstFrame, end: timelineEnd)

        return FoldedAttempt(
            playRequested: base.playRequested,
            playRequestedAt: base.playRequestedAt,
            playRequestedSeq: base.playRequestedSeq,
            firstFrameSeq: base.firstFrameSeq,
            firstFrameAt: base.firstFrameAt,
            userExit: base.userExit,
            anyError: base.anyError,
            anyFatal: base.anyFatal,
            fatalSeqs: base.fatalSeqs,
            dropped: base.dropped,
            rendered: base.rendered,
            watchMs: watch,
            seekMs: seek,
            rebufferMs: rebuffer,
            rebufferCount: rebufferCount,
            playTimeMs: play,
            switches: bitrateStats.switches,
            bitrateAcc: bitrateStats.accumulated,
            bitrateMs: bitrateStats.accumulatedMs
        )
    }

    private static func computeBitrate(qualities: [(time: Int64, bitrate: Int64)], start: Int64, end: Int64) -> (switches: Int, accumulated: Int64, accumulatedMs: Int64) {
        let initial = qualities.filter { $0.time <= start }.map { $0.bitrate }
        var current: Int64? = initial.last
        var switches = 0
        var cursor = start
        var accumulated: Int64 = 0
        var accumulatedMs: Int64 = 0

        for (at, bitrate) in qualities {
            if at <= start || at > end { continue }
            if let c = current, at > cursor {
                accumulated += c * (at - cursor)
                accumulatedMs += at - cursor
            }
            if current == nil {
                current = bitrate
            } else {
                switches += 1
                current = bitrate
            }
            cursor = at
        }

        if let c = current, end > cursor {
            accumulated += c * (end - cursor)
            accumulatedMs += end - cursor
        }

        return (switches, accumulated, accumulatedMs)
    }

    private static func computeStartup(_ attempts: [FoldedAttempt]) -> Int64? {
        let successful = attempts.filter { $0.playRequestedAt != nil && $0.firstFrameAt != nil }
        guard let chosen = successful.min(by: {
            if $0.playRequestedAt! == $1.playRequestedAt! {
                return ($0.playRequestedSeq ?? 0) < ($1.playRequestedSeq ?? 0)
            }
            return $0.playRequestedAt! < $1.playRequestedAt!
        }) else { return nil }

        return chosen.firstFrameAt! - chosen.playRequestedAt!
    }

    private static func calculateQoe(
        startupMs: Int64,
        rebufferRatio: Double?,
        droppedRatio: Double?,
        playbackFailure: Bool,
        weights: QoeWeights
    ) -> Double {
        let startupScore = computeStartupScore(startupMs: startupMs, weights: weights)
        let rebufferScore = computePenaltyScore(ratio: rebufferRatio, badRatio: weights.rebufferRatioBad)
        let droppedScore = computePenaltyScore(ratio: droppedRatio, badRatio: weights.droppedFrameRatioBad)
        let failureScore = playbackFailure ? 0.0 : 100.0

        return weights.startup * startupScore +
            weights.rebuffer * rebufferScore +
            weights.droppedFrames * droppedScore +
            weights.playbackFailure * failureScore
    }

    private static func computeStartupScore(startupMs: Int64, weights: QoeWeights) -> Double {
        if startupMs <= weights.startupGoodMs { return 100.0 }
        if startupMs >= weights.startupBadMs { return 0.0 }
        return 100.0 * Double(weights.startupBadMs - startupMs) / Double(weights.startupBadMs - weights.startupGoodMs)
    }

    private static func computePenaltyScore(ratio: Double?, badRatio: Double) -> Double {
        guard let ratio = ratio else { return 100.0 }
        let penalty = min(1.0, ratio / badRatio)
        return 100.0 * (1.0 - penalty)
    }
}
