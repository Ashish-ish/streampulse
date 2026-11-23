package dev.streampulse.core

import dev.streampulse.core.schema.StreamPulseEvent
import dev.streampulse.core.session.SessionMetadata
import dev.streampulse.core.session.SessionStateMachine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SessionStateMachineTest {

    @Test
    fun testNormalSessionFlow() {
        val events = mutableListOf<StreamPulseEvent>()
        var fakeMono = 100L

        val sm = SessionStateMachine(
            sessionId = "s1",
            playId = "p1",
            metadata = SessionMetadata(contentId = "v1"),
            clock = { (fakeMono++) to "2026-11-23T12:00:00.000Z" },
            eventListener = { events.add(it) }
        )

        assertEquals("session_start", events[0].type)

        sm.onPlayRequested()
        assertEquals("play_requested", events[1].type)

        sm.onFirstFrame()
        assertEquals("first_frame", events[2].type)

        // Duplicate first frame should be ignored
        sm.onFirstFrame()
        assertEquals(3, events.size)

        sm.end("ended")
        assertEquals("playback_end", events.last().type)
    }

    @Test
    fun testSeekDuringBuffering() {
        val events = mutableListOf<StreamPulseEvent>()
        var fakeMono = 100L

        val sm = SessionStateMachine(
            sessionId = "s2",
            playId = "p2",
            metadata = SessionMetadata(contentId = "v2"),
            clock = { 
                fakeMono += 100
                fakeMono to "2026-11-23T12:00:00.000Z" 
            },
            eventListener = { events.add(it) }
        )

        sm.onPlayRequested()
        sm.onFirstFrame()
        sm.onBufferingStart()
        sm.onSeekStart(1000, 5000)
        sm.onBufferingEnd()
        sm.onSeekEnd()
        sm.end()

        val types = events.map { it.type }
        assertTrue(types.contains("buffering_start"))
        assertTrue(types.contains("seek_start"))
        assertTrue(types.contains("buffering_end"))
        assertTrue(types.contains("seek_end"))
    }

    @Test
    fun testFatalErrorMidBufferEndsPlayback() {
        val events = mutableListOf<StreamPulseEvent>()
        var fakeMono = 100L

        val sm = SessionStateMachine(
            sessionId = "s3",
            playId = "p3",
            metadata = SessionMetadata(contentId = "v3"),
            clock = { 
                fakeMono += 50
                fakeMono to "2026-11-23T12:00:00.000Z" 
            },
            eventListener = { events.add(it) }
        )

        sm.onPlayRequested()
        sm.onBufferingStart()
        sm.onError("ERR_DECODER", fatal = true, message = "Decoder crashed")

        val types = events.map { it.type }
        assertTrue(types.contains("playback_error"))
        assertEquals("playback_end", types.last())
    }
}
