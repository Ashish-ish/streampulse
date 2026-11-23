package dev.streampulse.core

import dev.streampulse.core.adapter.AdapterListener
import dev.streampulse.core.adapter.PlayerAdapter
import dev.streampulse.core.queue.EventQueue
import dev.streampulse.core.sampling.Sampling
import dev.streampulse.core.schema.*
import dev.streampulse.core.scrub.Scrubber
import dev.streampulse.core.session.SessionMetadata
import dev.streampulse.core.session.SessionStateMachine
import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString

data class StreamPulseConfig(
    val endpoint: String,
    val appId: String,
    val appVersion: String = "1.0.0",
    val appBuild: String = "1",
    val sampleRate: Double = 1.0,
    val flushIntervalMs: Long = 15000L,
    val maxBatchSize: Int = 20,
    val maxQueueBytes: Long = 5_000_000L,
    val debug: Boolean = false,
    val platform: Platform = Platform.ANDROID,
    val sdkName: String = "streampulse-android",
    val sdkVersion: String = "0.1.0"
)

interface StreamPulseSession {
    val sessionId: String
    fun release()
}

object StreamPulse {
    private var config: StreamPulseConfig? = null
    private var isEnabled: Boolean = true
    private val queue = EventQueue()
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var flushJob: Job? = null
    private var installId: String = "00000000-0000-4000-8000-000000000001"
    private var clockSkewDeltaMs: Long = 0L

    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun init(cfg: StreamPulseConfig) {
        try {
            config = cfg
            if (cfg.debug) println("[StreamPulse] Initialized with endpoint ${cfg.endpoint}")
            startPeriodicFlush()
        } catch (e: Throwable) {
            handleError(e)
        }
    }

    fun setInstallId(id: String) {
        installId = id
    }

    fun setEnabled(enabled: Boolean) {
        try {
            isEnabled = enabled
            if (!enabled) {
                scope.launch { queue.clear() }
            }
        } catch (e: Throwable) {
            handleError(e)
        }
    }

    fun isEnabled(): Boolean = isEnabled

    fun <TPlayer> attach(
        player: TPlayer,
        adapter: PlayerAdapter<TPlayer>,
        sessionMeta: SessionMetadata
    ): StreamPulseSession {
        val sessionId = generateUuid()
        val playId = generateUuid()

        // Deterministic sampling
        val sampled = config?.let { Sampling.isSessionIncluded(sessionId, it.sampleRate) } ?: true
        if (!sampled || !isEnabled) {
            return object : StreamPulseSession {
                override val sessionId: String = sessionId
                override fun release() {}
            }
        }

        val stateMachine = SessionStateMachine(
            sessionId = sessionId,
            playId = playId,
            metadata = sessionMeta,
            clock = { getMonotonicTimeMs() to getWallClockIso() },
            eventListener = { event ->
                scope.launch {
                    queue.enqueue(event)
                    if (queue.size() >= (config?.maxBatchSize ?: 20)) {
                        flush()
                    }
                }
            }
        )

        val listener = object : AdapterListener {
            override fun onPlayRequested() = stateMachine.onPlayRequested()
            override fun onFirstFrame() = stateMachine.onFirstFrame()
            override fun onBufferingStart() = stateMachine.onBufferingStart()
            override fun onBufferingEnd() = stateMachine.onBufferingEnd()
            override fun onSeekStart(fromMs: Long, toMs: Long) = stateMachine.onSeekStart(fromMs, toMs)
            override fun onSeekEnd() = stateMachine.onSeekEnd()
            override fun onQualityChange(bitrateBps: Long, width: Int, height: Int) =
                stateMachine.onQualityChange(bitrateBps, width, height)
            override fun onDroppedFrames(dropped: Long, rendered: Long) =
                stateMachine.onDroppedFrames(dropped, rendered)
            override fun onError(code: String, fatal: Boolean, message: String) =
                stateMachine.onError(code, fatal, Scrubber.scrubMessage(message))
            override fun onHeartbeat(positionMs: Long, bufferedMs: Long, droppedTotal: Long, renderedTotal: Long) =
                stateMachine.onHeartbeat(positionMs, bufferedMs, droppedTotal, renderedTotal)
            override fun onPlaybackEnd(reason: String) = stateMachine.end(reason)
        }

        adapter.attach(player, listener)

        return object : StreamPulseSession {
            override val sessionId: String = sessionId
            override fun release() {
                try {
                    adapter.detach()
                    stateMachine.end("user_exit")
                    flush()
                } catch (e: Throwable) {
                    handleError(e)
                }
            }
        }
    }

    fun flush() {
        if (!isEnabled) return
        scope.launch {
            try {
                val batchSize = config?.maxBatchSize ?: 20
                val events = queue.peek(batchSize)
                if (events.isEmpty()) return@launch

                val batch = StreamPulseBatch(
                    schemaVersion = "1.0",
                    batchId = generateUuid(),
                    sentAt = getWallClockIso(),
                    sdk = SdkInfo(name = config?.sdkName ?: "streampulse-android", version = config?.sdkVersion ?: "0.1.0"),
                    app = AppInfo(id = config?.appId ?: "app", version = config?.appVersion ?: "1.0.0", build = config?.appBuild ?: "1"),
                    device = DeviceInfo(
                        installId = installId,
                        platform = config?.platform ?: Platform.ANDROID,
                        osVersion = "14",
                        model = "Device",
                        networkType = NetworkType.WIFI
                    ),
                    events = events
                )

                // Enqueue or dispatch batch
                if (config?.debug == true) {
                    println("[StreamPulse] Dispatched batch ${batch.batchId} with ${events.size} events")
                }
                queue.remove(events)
            } catch (e: Throwable) {
                handleError(e)
            }
        }
    }

    private fun startPeriodicFlush() {
        flushJob?.cancel()
        val interval = config?.flushIntervalMs ?: 15000L
        flushJob = scope.launch {
            while (isActive) {
                delay(interval)
                flush()
            }
        }
    }

    private fun handleError(t: Throwable) {
        if (config?.debug == true) {
            println("[StreamPulse Error] ${t.message}")
        }
    }

    // Helper functions
    private fun getMonotonicTimeMs(): Long = (System.nanoTime() / 1_000_000L)

    private fun getWallClockIso(): String {
        val now = System.currentTimeMillis() + clockSkewDeltaMs
        return java.time.Instant.ofEpochMilli(now).toString()
    }

    private fun generateUuid(): String = java.util.UUID.randomUUID().toString()
}
