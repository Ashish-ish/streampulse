package dev.streampulse.core.queue

import dev.streampulse.core.schema.StreamPulseEvent
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class EventQueue(
    val maxEvents: Int = 5000,
    val maxBytes: Long = 5_000_000L
) {
    private val mutex = Mutex()
    private val buffer = mutableListOf<StreamPulseEvent>()
    private var estimatedBytes: Long = 0L

    companion object {
        val CRITICAL_EVENT_TYPES = setOf("app_health", "playback_end")
    }

    suspend fun enqueue(event: StreamPulseEvent): Boolean = mutex.withLock {
        val eventBytes = estimateEventBytes(event)

        // If queue exceeds limits, drop oldest non-critical events
        while (buffer.size >= maxEvents || (estimatedBytes + eventBytes > maxBytes && buffer.isNotEmpty())) {
            val dropIdx = buffer.indexOfFirst { it.type !in CRITICAL_EVENT_TYPES }
            if (dropIdx != -1) {
                val dropped = buffer.removeAt(dropIdx)
                estimatedBytes -= estimateEventBytes(dropped)
            } else {
                // If all queued events are critical and still overflowing, drop oldest
                val dropped = buffer.removeAt(0)
                estimatedBytes -= estimateEventBytes(dropped)
            }
        }

        buffer.add(event)
        estimatedBytes += eventBytes
        return true
    }

    suspend fun peek(count: Int): List<StreamPulseEvent> = mutex.withLock {
        buffer.take(count)
    }

    suspend fun remove(events: List<StreamPulseEvent>) = mutex.withLock {
        for (ev in events) {
            val idx = buffer.indexOfFirst { it.sessionId == ev.sessionId && it.seq == ev.seq }
            if (idx != -1) {
                val removed = buffer.removeAt(idx)
                estimatedBytes -= estimateEventBytes(removed)
            }
        }
    }

    suspend fun clear() = mutex.withLock {
        buffer.clear()
        estimatedBytes = 0L
    }

    suspend fun size(): Int = mutex.withLock {
        buffer.size
    }

    private fun estimateEventBytes(event: StreamPulseEvent): Long {
        // Approximate JSON footprint in bytes
        return 128L + event.type.length + event.data.toString().length
    }
}
