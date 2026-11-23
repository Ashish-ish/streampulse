package dev.streampulse.media3

import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Format
import dev.streampulse.core.adapter.AdapterListener
import dev.streampulse.core.adapter.PlayerAdapter

class Media3Adapter : PlayerAdapter<Player> {
    private var player: Player? = null
    private var listener: AdapterListener? = null
    private var hasTriggeredPlayRequested = false
    private var lastPositionMs: Long = 0L

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            val l = listener ?: return
            when (playbackState) {
                Player.STATE_BUFFERING -> {
                    l.onBufferingStart()
                }
                Player.STATE_READY -> {
                    l.onBufferingEnd()
                }
                Player.STATE_ENDED -> {
                    l.onPlaybackEnd("ended")
                }
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            val l = listener ?: return
            if (isPlaying && !hasTriggeredPlayRequested) {
                hasTriggeredPlayRequested = true
                l.onPlayRequested()
            }
        }

        override fun onRenderedFirstFrame() {
            listener?.onFirstFrame()
        }

        override fun onPlayerError(error: PlaybackException) {
            listener?.onError(
                code = error.errorCodeName,
                fatal = true,
                message = error.message ?: "Unknown player error"
            )
        }

        override fun onPositionDiscontinuity(
            oldPosition: Player.PositionInfo,
            newPosition: Player.PositionInfo,
            reason: Int
        ) {
            val l = listener ?: return
            if (reason == Player.DISCONTINUITY_REASON_SEEK) {
                l.onSeekStart(oldPosition.positionMs, newPosition.positionMs)
                l.onSeekEnd()
            }
        }
    }

    override fun attach(player: Player, listener: AdapterListener) {
        this.player = player
        this.listener = listener
        hasTriggeredPlayRequested = false
        player.addListener(playerListener)

        if (player.playWhenReady) {
            hasTriggeredPlayRequested = true
            listener.onPlayRequested()
        }
    }

    override fun detach() {
        player?.removeListener(playerListener)
        player = null
        listener = null
    }

    // Called periodically by HUD / background poller for dropped frame deltas
    fun reportDroppedFrames(dropped: Long, rendered: Long) {
        listener?.onDroppedFrames(dropped, rendered)
    }

    // Called on downstream format transition
    fun reportFormatChange(format: Format) {
        val bitrate = if (format.bitrate != Format.NO_VALUE) format.bitrate.toLong() else 2500000L
        val width = if (format.width != Format.NO_VALUE) format.width else 1920
        val height = if (format.height != Format.NO_VALUE) format.height else 1080
        listener?.onQualityChange(bitrate, width, height)
    }
}
