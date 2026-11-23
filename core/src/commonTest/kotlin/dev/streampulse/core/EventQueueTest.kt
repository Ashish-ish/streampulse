package dev.streampulse.core

import dev.streampulse.core.queue.EventQueue
import dev.streampulse.core.schema.StreamPulseEvent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EventQueueTest {

    @Test
    fun testNeverEvictsCriticalEventsBeforeNonCritical() = runBlocking {
        // Small queue with capacity of 3 events
        val queue = EventQueue(maxEvents = 3, maxBytes = 10000L)

        val ev1 = makeEvent(0, "play_requested")
        val ev2 = makeEvent(1, "app_health") // Critical!
        val ev3 = makeEvent(2, "heartbeat")

        queue.enqueue(ev1)
        queue.enqueue(ev2)
        queue.enqueue(ev3)
        assertEquals(3, queue.size())

        // Enqueue 4th event, which should trigger eviction of oldest non-critical (ev1)
        val ev4 = makeEvent(3, "heartbeat")
        queue.enqueue(ev4)
        assertEquals(3, queue.size())

        val peeked = queue.peek(3)
        // ev1 was dropped, ev2 (app_health) MUST be preserved!
        assertTrue(peeked.any { it.type == "app_health" }, "Critical app_health was improperly evicted")
        assertEquals(listOf("app_health", "heartbeat", "heartbeat"), peeked.map { it.type })
    }

    private fun makeEvent(seq: Int, type: String): StreamPulseEvent {
        return StreamPulseEvent(
            type = type,
            sessionId = "s1",
            playId = "p1",
            seq = seq,
            tMonoMs = seq * 1000L,
            tWall = "2026-11-23T12:00:00.000Z",
            data = JsonObject(emptyMap())
        )
    }
}
