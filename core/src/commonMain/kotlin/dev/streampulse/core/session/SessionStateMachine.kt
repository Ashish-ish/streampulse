package dev.streampulse.core.session

import dev.streampulse.core.schema.StreamPulseEvent
import kotlinx.serialization.json.*

enum class SessionState {
    INITIALIZED,
    PLAY_REQUESTED,
    PLAYING,
    BUFFERING,
    SEEKING,
    ENDED
}

data class SessionMetadata(
    val contentId: String,
    val contentIdHashed: Boolean = false,
    val streamType: String = "vod",
    val protocol: String = "hls",
    val playerName: String = "DefaultPlayer",
    val playerVersion: String = "1.0.0",
    val cdn: String? = null
)

class SessionStateMachine(
    val sessionId: String,
    val playId: String,
    val metadata: SessionMetadata,
    private val clock: () -> Pair<Long, String>, // returns (t_mono_ms, t_wall_iso)
    private val eventListener: (StreamPulseEvent) -> Unit
) {
    private var state: SessionState = SessionState.INITIALIZED
    private var seq: Int = 0
    private var hasFirstFrame: Boolean = false
    private var isBuffering: Boolean = false
    private var isSeeking: Boolean = false

    init {
        // Emit session_start upon creation
        val (tMono, tWall) = clock()
        val data = buildJsonObject {
            put("content_id", metadata.contentId)
            put("content_id_hashed", metadata.contentIdHashed)
            put("stream_type", metadata.streamType)
            put("protocol", metadata.protocol)
            put("player", buildJsonObject {
                put("name", metadata.playerName)
                put("version", metadata.playerVersion)
            })
            metadata.cdn?.let { put("cdn", it) }
        }
        emit("session_start", data, tMono, tWall)
    }

    fun onPlayRequested() {
        if (state == SessionState.ENDED) return
        if (state == SessionState.INITIALIZED) {
            state = SessionState.PLAY_REQUESTED
            val (tMono, tWall) = clock()
            emit("play_requested", JsonObject(emptyMap()), tMono, tWall)
        }
    }

    fun onFirstFrame() {
        if (state == SessionState.ENDED) return
        if (!hasFirstFrame) {
            hasFirstFrame = true
            state = SessionState.PLAYING
            val (tMono, tWall) = clock()
            emit("first_frame", JsonObject(emptyMap()), tMono, tWall)
        }
    }

    fun onBufferingStart() {
        if (state == SessionState.ENDED) return
        if (!isBuffering) {
            isBuffering = true
            val (tMono, tWall) = clock()
            emit("buffering_start", JsonObject(emptyMap()), tMono, tWall)
        }
    }

    fun onBufferingEnd() {
        if (state == SessionState.ENDED) return
        if (isBuffering) {
            isBuffering = false
            val (tMono, tWall) = clock()
            emit("buffering_end", JsonObject(emptyMap()), tMono, tWall)
        }
    }

    fun onSeekStart(fromMs: Long, toMs: Long) {
        if (state == SessionState.ENDED) return
        if (!isSeeking) {
            isSeeking = true
            val (tMono, tWall) = clock()
            val data = buildJsonObject {
                put("from_ms", fromMs)
                put("to_ms", toMs)
            }
            emit("seek_start", data, tMono, tWall)
        }
    }

    fun onSeekEnd() {
        if (state == SessionState.ENDED) return
        if (isSeeking) {
            isSeeking = false
            val (tMono, tWall) = clock()
            emit("seek_end", JsonObject(emptyMap()), tMono, tWall)
        }
    }

    fun onQualityChange(bitrateBps: Long, width: Int, height: Int) {
        if (state == SessionState.ENDED) return
        val (tMono, tWall) = clock()
        val data = buildJsonObject {
            put("bitrate_bps", bitrateBps)
            put("width", width)
            put("height", height)
        }
        emit("quality_change", data, tMono, tWall)
    }

    fun onDroppedFrames(dropped: Long, rendered: Long) {
        if (state == SessionState.ENDED) return
        if (dropped == 0L && rendered == 0L) return
        val (tMono, tWall) = clock()
        val data = buildJsonObject {
            put("dropped", dropped)
            put("rendered", rendered)
        }
        emit("dropped_frames", data, tMono, tWall)
    }

    fun onError(code: String, fatal: Boolean, message: String) {
        if (state == SessionState.ENDED) return
        val (tMono, tWall) = clock()
        val data = buildJsonObject {
            put("code", code)
            put("fatal", fatal)
            put("message", message)
        }
        emit("playback_error", data, tMono, tWall)
        if (fatal) {
            end("error")
        }
    }

    fun onHeartbeat(positionMs: Long, bufferedMs: Long, droppedTotal: Long, renderedTotal: Long) {
        if (state == SessionState.ENDED) return
        val (tMono, tWall) = clock()
        val data = buildJsonObject {
            put("position_ms", positionMs)
            put("buffered_ms", bufferedMs)
            put("dropped_total", droppedTotal)
            put("rendered_total", renderedTotal)
        }
        emit("heartbeat", data, tMono, tWall)
    }

    fun end(reason: String = "ended") {
        if (state == SessionState.ENDED) return
        // Close open buffer or seek before marking state as ENDED
        if (isBuffering) {
            isBuffering = false
            val (tMono, tWall) = clock()
            emit("buffering_end", JsonObject(emptyMap()), tMono, tWall)
        }
        if (isSeeking) {
            isSeeking = false
            val (tMono, tWall) = clock()
            emit("seek_end", JsonObject(emptyMap()), tMono, tWall)
        }

        state = SessionState.ENDED
        val (tMono, tWall) = clock()
        val data = buildJsonObject {
            put("reason", reason)
        }
        emit("playback_end", data, tMono, tWall)
    }

    private fun emit(type: String, data: JsonObject, tMono: Long, tWall: String) {
        val event = StreamPulseEvent(
            type = type,
            sessionId = sessionId,
            playId = playId,
            seq = seq++,
            tMonoMs = tMono,
            tWall = tWall,
            data = data
        )
        eventListener(event)
    }
}
