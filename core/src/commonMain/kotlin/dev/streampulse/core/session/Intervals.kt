package dev.streampulse.core.session

import kotlin.math.max
import kotlin.math.min

data class Interval(val start: Long, val end: Long) {
    val duration: Long get() = max(0L, end - start)
}

object IntervalMath {
    fun measure(intervals: List<Interval>): Long {
        return intervals.sumOf { it.duration }
    }

    fun clip(intervals: List<Interval>, start: Long, end: Long): List<Interval> {
        val clipped = mutableListOf<Interval>()
        for (item in intervals) {
            val left = max(item.start, start)
            val right = min(item.end, end)
            if (right > left) {
                clipped.add(Interval(left, right))
            }
        }
        return clipped
    }

    fun subtractOne(interval: Interval, cut: Interval): List<Interval> {
        if (interval.end <= interval.start) return emptyList()
        if (cut.end <= interval.start || cut.start >= interval.end || cut.end <= cut.start) {
            return listOf(interval)
        }
        val pieces = mutableListOf<Interval>()
        if (cut.start > interval.start) {
            pieces.add(Interval(interval.start, cut.start))
        }
        if (cut.end < interval.end) {
            pieces.add(Interval(cut.end, interval.end))
        }
        return pieces
    }

    fun subtractAll(interval: Interval, cuts: List<Interval>): List<Interval> {
        var pieces = listOf(interval)
        for (cut in cuts) {
            val nextPieces = mutableListOf<Interval>()
            for (piece in pieces) {
                nextPieces.addAll(subtractOne(piece, cut))
            }
            pieces = nextPieces
        }
        return pieces.filter { it.end > it.start }
    }
}
