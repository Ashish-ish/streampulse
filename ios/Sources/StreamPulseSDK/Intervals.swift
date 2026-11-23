import Foundation

public struct Interval: Equatable, Sendable {
    public let start: Int64
    public let end: Int64

    public init(_ start: Int64, _ end: Int64) {
        self.start = start
        self.end = end
    }

    public var duration: Int64 {
        max(0, end - start)
    }
}

public enum IntervalMath {
    public static func measure(_ intervals: [Interval]) -> Int64 {
        intervals.reduce(0) { $0 + $1.duration }
    }

    public static func clip(_ intervals: [Interval], start: Int64, end: Int64) -> [Interval] {
        var clipped: [Interval] = []
        for item in intervals {
            let left = max(item.start, start)
            let right = min(item.end, end)
            if right > left {
                clipped.append(Interval(left, right))
            }
        }
        return clipped
    }

    public static func subtractOne(interval: Interval, cut: Interval) -> [Interval] {
        if interval.end <= interval.start { return [] }
        if cut.end <= interval.start || cut.start >= interval.end || cut.end <= cut.start {
            return [interval]
        }
        var pieces: [Interval] = []
        if cut.start > interval.start {
            pieces.append(Interval(interval.start, cut.start))
        }
        if cut.end < interval.end {
            pieces.append(Interval(cut.end, interval.end))
        }
        return pieces
    }

    public static func subtractAll(interval: Interval, cuts: [Interval]) -> [Interval] {
        var pieces = [interval]
        for cut in cuts {
            var nextPieces: [Interval] = []
            for piece in pieces {
                nextPieces.append(contentsOf: subtractOne(interval: piece, cut: cut))
            }
            pieces = nextPieces
        }
        return pieces.filter { $0.end > $0.start }
    }
}
