package dev.streampulse.core.session

import dev.streampulse.core.schema.StreamPulseEvent
import kotlinx.serialization.json.*
import kotlin.math.min
import kotlin.math.roundToLong

data class SessionRollup(
    val startupMs: Long?,
    val vsf: Boolean,
    val ebvs: Boolean,
    val exitBeforeStartOther: Boolean,
    val watchMs: Long,
    val seekMs: Long,
    val rebufferMs: Long,
    val rebufferCount: Int,
    val playTimeMs: Long,
    val rebufferRatio: String?,
    val rebuffersPerHour: String?,
    val rebufferBucket: String?,
    val dropped: Long,
    val rendered: Long,
    val droppedFrameRatio: String?,
    val droppedFrameBucket: String?,
    val avgBitrateBps: Long?,
    val bitrateSwitchCount: Int,
    val hasFirstFrame: Boolean,
    val playbackFailure: Boolean,
    val appHealthKinds: List<String>,
    val crashOrAnr: Boolean,
    val qoe: String?,
    val clockRegression: Boolean,
    val seqGaps: Int
)

data class QoeWeights(
    val startup: Double = 0.30,
    val rebuffer: Double = 0.35,
    val droppedFrames: Double = 0.15,
    val playbackFailure: Double = 0.20,
    val startupGoodMs: Long = 1000L,
    val startupBadMs: Long = 5000L,
    val rebufferRatioBad: Double = 0.10,
    val droppedFrameRatioBad: Double = 0.05
)

object MetricFold {
    private val CRASH_ANR_KINDS = setOf("crash", "anr", "native_crash")
    private val SESSION_SCOPED = setOf("session_start", "app_health")

    fun ratioBucket(ratio: Double?): String? {
        if (ratio == null) return null
        if (ratio == 0.0) return "0"
        if (ratio <= 0.01) return "0-1%"
        if (ratio <= 0.03) return "1-3%"
        if (ratio <= 0.10) return "3-10%"
        return ">10%"
    }

    fun compute(events: List<StreamPulseEvent>, weights: QoeWeights = QoeWeights()): SessionRollup {
        require(events.isNotEmpty()) { "events cannot be empty" }

        val ordered = events.sortedBy { it.seq }
        val seqs = ordered.map { it.seq }.toSet()
        val lastSeq = ordered.last().seq
        var seqGaps = 0
        for (i in 0..lastSeq) {
            if (i !in seqs) seqGaps++
        }

        val comparable = ordered.filter { it.type != "app_health" }
        var clockRegression = false
        for (i in 0 until comparable.size - 1) {
            if (comparable[i + 1].tMonoMs < comparable[i].tMonoMs) {
                clockRegression = true
                break
            }
        }

        val attempts = linkedMapOf<String, MutableList<StreamPulseEvent>>()
        val health = mutableListOf<String>()

        for (ev in ordered) {
            if (ev.type == "app_health") {
                val kind = ev.data["kind"]?.jsonPrimitive?.content ?: ""
                health.add(kind)
                continue
            }
            if (ev.type in SESSION_SCOPED) continue

            attempts.getOrPut(ev.playId) { mutableListOf() }.add(ev)
        }

        val foldedAttempts = attempts.values.map { foldAttempt(it) }
        val hasPlay = foldedAttempts.any { it.playRequested }
        val hasFirstFrame = foldedAttempts.any { it.firstFrameSeq != null }
        val anyError = foldedAttempts.any { it.anyError }
        val anyFatal = foldedAttempts.any { it.anyFatal }
        val anyUserExit = foldedAttempts.any { it.userExit }

        var startup = computeStartup(foldedAttempts)
        if (startup != null && startup < 0) {
            clockRegression = true
            startup = null
        }

        val firstFrameSeq = foldedAttempts.mapNotNull { it.firstFrameSeq }.minOrNull()
        val playbackFailure = hasFirstFrame && firstFrameSeq != null && foldedAttempts.any { attempt ->
            attempt.fatalSeqs.any { it > firstFrameSeq }
        }

        val vsf = hasPlay && !hasFirstFrame && anyFatal
        val ebvs = hasPlay && !hasFirstFrame && !anyError && anyUserExit
        val exitOther = hasPlay && !hasFirstFrame && !vsf && !ebvs

        var watchMs = 0L
        var seekMs = 0L
        var rebufferMs = 0L
        var rebufferCount = 0
        var playTimeMs = 0L
        var dropped = 0L
        var rendered = 0L
        var switches = 0
        var bitrateAcc = 0L
        var bitrateMs = 0L

        for (a in foldedAttempts) {
            dropped += a.dropped
            rendered += a.rendered
            if (a.firstFrameSeq == null || a.watchMs == null) continue

            watchMs += a.watchMs
            seekMs += a.seekMs
            rebufferMs += a.rebufferMs
            rebufferCount += a.rebufferCount
            playTimeMs += a.playTimeMs
            switches += a.switches
            bitrateAcc += a.bitrateAcc
            bitrateMs += a.bitrateMs
        }

        val rebufferRatio = if (playTimeMs + rebufferMs > 0) rebufferMs.toDouble() / (playTimeMs + rebufferMs) else null
        val droppedRatio = if (dropped + rendered > 0) dropped.toDouble() / (dropped + rendered) else null
        val rebuffersPerHour = if (playTimeMs > 0) (rebufferCount.toDouble() * 3_600_000.0) / playTimeMs else null
        val avgBitrateBps = if (bitrateMs > 0) (bitrateAcc.toDouble() / bitrateMs).roundToLong() else null

        val qoe = if (hasFirstFrame && startup != null && !clockRegression) {
            calculateQoe(startup, rebufferRatio, droppedRatio, playbackFailure, weights)
        } else null

        return SessionRollup(
            startupMs = startup,
            vsf = vsf,
            ebvs = ebvs,
            exitBeforeStartOther = exitOther,
            watchMs = watchMs,
            seekMs = seekMs,
            rebufferMs = rebufferMs,
            rebufferCount = rebufferCount,
            playTimeMs = playTimeMs,
            rebufferRatio = rebufferRatio?.formatFixed(6),
            rebuffersPerHour = rebuffersPerHour?.formatFixed(4),
            rebufferBucket = ratioBucket(rebufferRatio),
            dropped = dropped,
            rendered = rendered,
            droppedFrameRatio = droppedRatio?.formatFixed(6),
            droppedFrameBucket = ratioBucket(droppedRatio),
            avgBitrateBps = avgBitrateBps,
            bitrateSwitchCount = switches,
            hasFirstFrame = hasFirstFrame,
            playbackFailure = playbackFailure,
            appHealthKinds = health,
            crashOrAnr = health.any { it in CRASH_ANR_KINDS },
            qoe = qoe?.formatFixed(2),
            clockRegression = clockRegression,
            seqGaps = seqGaps
        )
    }

    private data class FoldedAttempt(
        val playRequested: Boolean,
        val playRequestedAt: Long?,
        val playRequestedSeq: Int?,
        val firstFrameSeq: Int?,
        val firstFrameAt: Long?,
        val userExit: Boolean,
        val anyError: Boolean,
        val anyFatal: Boolean,
        val fatalSeqs: List<Int>,
        val dropped: Long,
        val rendered: Long,
        val watchMs: Long?,
        val seekMs: Long,
        val rebufferMs: Long,
        val rebufferCount: Int,
        val playTimeMs: Long,
        val switches: Int,
        val bitrateAcc: Long,
        val bitrateMs: Long
    )

    private fun foldAttempt(events: List<StreamPulseEvent>): FoldedAttempt {
        val endIdx = events.indexOfFirst { it.type == "playback_end" }
        val considered = if (endIdx == -1) events else events.subList(0, endIdx + 1)

        var playRequestedAt: Long? = null
        var playRequestedSeq: Int? = null
        var firstFrameAt: Long? = null
        var firstFrameSeq: Int? = null
        var endAtMs: Long? = null
        var userExit = false
        var anyError = false
        var anyFatal = false
        val fatalSeqs = mutableListOf<Int>()
        val buffers = mutableListOf<Interval>()
        val seeks = mutableListOf<Interval>()
        var openBuffer: Long? = null
        var openSeek: Long? = null
        val qualities = mutableListOf<Pair<Long, Long>>()
        var dropped = 0L
        var rendered = 0L

        for (ev in considered) {
            val at = ev.tMonoMs
            when (ev.type) {
                "play_requested" -> if (playRequestedAt == null) {
                    playRequestedAt = at
                    playRequestedSeq = ev.seq
                }
                "first_frame" -> if (firstFrameAt == null) {
                    firstFrameAt = at
                    firstFrameSeq = ev.seq
                }
                "buffering_start" -> if (openBuffer == null) openBuffer = at
                "buffering_end" -> if (openBuffer != null) {
                    if (at >= openBuffer!!) buffers.add(Interval(openBuffer!!, at))
                    openBuffer = null
                }
                "seek_start" -> if (openSeek == null) openSeek = at
                "seek_end" -> if (openSeek != null) {
                    if (at >= openSeek!!) seeks.add(Interval(openSeek!!, at))
                    openSeek = null
                }
                "quality_change" -> {
                    val rate = ev.data["bitrate_bps"]?.jsonPrimitive?.longOrNull ?: 0L
                    qualities.add(at to rate)
                }
                "dropped_frames" -> {
                    dropped += ev.data["dropped"]?.jsonPrimitive?.longOrNull ?: 0L
                    rendered += ev.data["rendered"]?.jsonPrimitive?.longOrNull ?: 0L
                }
                "playback_error" -> {
                    anyError = true
                    val fatal = ev.data["fatal"]?.jsonPrimitive?.booleanOrNull ?: false
                    if (fatal) {
                        anyFatal = true
                        fatalSeqs.add(ev.seq)
                    }
                }
                "playback_end" -> {
                    endAtMs = at
                    val reason = ev.data["reason"]?.jsonPrimitive?.content
                    userExit = reason == "user_exit"
                }
            }
        }

        val base = FoldedAttempt(
            playRequested = playRequestedAt != null,
            playRequestedAt = playRequestedAt,
            playRequestedSeq = playRequestedSeq,
            firstFrameSeq = firstFrameSeq,
            firstFrameAt = firstFrameAt,
            userExit = userExit,
            anyError = anyError,
            anyFatal = anyFatal,
            fatalSeqs = fatalSeqs,
            dropped = dropped,
            rendered = rendered,
            watchMs = null,
            seekMs = 0L,
            rebufferMs = 0L,
            rebufferCount = 0,
            playTimeMs = 0L,
            switches = 0,
            bitrateAcc = 0L,
            bitrateMs = 0L
        )

        if (firstFrameAt == null) return base

        val timelineEnd = endAtMs ?: considered.last().tMonoMs
        if (timelineEnd < firstFrameAt) return base

        if (openBuffer != null && timelineEnd >= openBuffer!!) {
            buffers.add(Interval(openBuffer!!, timelineEnd))
        }
        if (openSeek != null && timelineEnd >= openSeek!!) {
            seeks.add(Interval(openSeek!!, timelineEnd))
        }

        val watch = timelineEnd - firstFrameAt
        val clippedBuffers = IntervalMath.clip(buffers, firstFrameAt, timelineEnd)
        val clippedSeeks = IntervalMath.clip(seeks, firstFrameAt, timelineEnd)

        var rebufferCount = 0
        val rebufferPieces = mutableListOf<Interval>()
        for (interval in clippedBuffers) {
            val pieces = IntervalMath.subtractAll(interval, clippedSeeks)
            if (IntervalMath.measure(pieces) > 0) {
                rebufferCount++
                rebufferPieces.addAll(pieces)
            }
        }

        val rebuffer = IntervalMath.measure(rebufferPieces)
        val seek = IntervalMath.measure(clippedSeeks)
        val play = maxOf(0L, watch - seek - rebuffer)

        val (switches, bitrateAcc, bitrateMs) = computeBitrate(qualities, firstFrameAt, timelineEnd)

        return base.copy(
            watchMs = watch,
            seekMs = seek,
            rebufferMs = rebuffer,
            rebufferCount = rebufferCount,
            playTimeMs = play,
            switches = switches,
            bitrateAcc = bitrateAcc,
            bitrateMs = bitrateMs
        )
    }

    private fun computeBitrate(qualities: List<Pair<Long, Long>>, start: Long, end: Long): Triple<Int, Long, Long> {
        val initial = qualities.filter { it.first <= start }.map { it.second }
        var current: Long? = initial.lastOrNull()
        var switches = 0
        var cursor = start
        var accumulated = 0L
        var accumulatedMs = 0L

        for ((at, bitrate) in qualities) {
            if (at <= start || at > end) continue
            if (current != null && at > cursor) {
                accumulated += current * (at - cursor)
                accumulatedMs += at - cursor
            }
            if (current == null) {
                current = bitrate
            } else {
                switches++
                current = bitrate
            }
            cursor = at
        }

        if (current != null && end > cursor) {
            accumulated += current * (end - cursor)
            accumulatedMs += end - cursor
        }

        return Triple(switches, accumulated, accumulatedMs)
    }

    private fun computeStartup(attempts: List<FoldedAttempt>): Long? {
        val successful = attempts.filter { it.playRequestedAt != null && it.firstFrameAt != null }
        if (successful.isEmpty()) return null

        val chosen = successful.minWith(compareBy({ it.playRequestedAt!! }, { it.playRequestedSeq ?: 0 }))
        return chosen.firstFrameAt!! - chosen.playRequestedAt!!
    }

    private fun calculateQoe(
        startupMs: Long,
        rebufferRatio: Double?,
        droppedRatio: Double?,
        playbackFailure: Boolean,
        weights: QoeWeights
    ): Double {
        val startupScore = computeStartupScore(startupMs, weights)
        val rebufferScore = computePenaltyScore(rebufferRatio, weights.rebufferRatioBad)
        val droppedScore = computePenaltyScore(droppedRatio, weights.droppedFrameRatioBad)
        val failureScore = if (playbackFailure) 0.0 else 100.0

        return weights.startup * startupScore +
                weights.rebuffer * rebufferScore +
                weights.droppedFrames * droppedScore +
                weights.playbackFailure * failureScore
    }

    private fun computeStartupScore(startupMs: Long, weights: QoeWeights): Double {
        if (startupMs <= weights.startupGoodMs) return 100.0
        if (startupMs >= weights.startupBadMs) return 0.0
        return 100.0 * (weights.startupBadMs - startupMs).toDouble() / (weights.startupBadMs - weights.startupGoodMs).toDouble()
    }

    private fun computePenaltyScore(ratio: Double?, badRatio: Double): Double {
        if (ratio == null) return 100.0
        val penalty = min(1.0, ratio / badRatio)
        return 100.0 * (1.0 - penalty)
    }

    private fun Double.formatFixed(places: Int): String {
        val factor = Math.pow(10.0, places.toDouble())
        val rounded = (this * factor).roundToLong()
        val str = rounded.toString().padStart(places + 1, '0')
        val intPart = if (str.length > places) str.substring(0, str.length - places) else "0"
        val fracPart = str.takeLast(places)
        return "$intPart.$fracPart"
    }
}
