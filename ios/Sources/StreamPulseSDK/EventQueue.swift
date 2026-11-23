import Foundation

public final class EventQueue: @unchecked Sendable {
    private let lock = NSLock()
    private var events: [StreamPulseEvent] = []
    private let maxEvents: Int
    private let maxBytes: Int
    private var currentBytes: Int = 0

    private static let criticalEventTypes: Set<String> = ["app_health", "playback_end"]

    public init(maxEvents: Int = 5000, maxBytes: Int = 5 * 1024 * 1024) {
        self.maxEvents = maxEvents
        self.maxBytes = maxBytes
    }

    public func enqueue(_ event: StreamPulseEvent) {
        lock.lock()
        defer { lock.unlock() }

        let estimatedSize = estimateSize(event)

        // Evict if at capacity
        while events.count >= maxEvents || (currentBytes + estimatedSize > maxBytes && !events.isEmpty) {
            // Find oldest non-critical event
            if let nonCriticalIdx = events.firstIndex(where: { !EventQueue.criticalEventTypes.contains($0.type) }) {
                let removed = events.remove(at: nonCriticalIdx)
                currentBytes -= estimateSize(removed)
            } else {
                // All events are critical, evict oldest critical
                let removed = events.removeFirst()
                currentBytes -= estimateSize(removed)
            }
        }

        events.append(event)
        currentBytes += estimatedSize
    }

    public func peek(count: Int) -> [StreamPulseEvent] {
        lock.lock()
        defer { lock.unlock() }
        let k = min(count, events.count)
        return Array(events.prefix(k))
    }

    public func remove(count: Int) {
        lock.lock()
        defer { lock.unlock() }
        let k = min(count, events.count)
        for _ in 0..<k {
            let removed = events.removeFirst()
            currentBytes -= estimateSize(removed)
        }
    }

    public func count() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return events.count
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        events.removeAll()
        currentBytes = 0
    }

    private func estimateSize(_ event: StreamPulseEvent) -> Int {
        // Base overhead + string lengths
        return 128 + event.type.utf8.count + event.sessionId.utf8.count + event.playId.utf8.count
    }
}
