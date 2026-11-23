package dev.streampulse.core.adapter

interface AdapterListener {
    fun onPlayRequested()
    fun onFirstFrame()
    fun onBufferingStart()
    fun onBufferingEnd()
    fun onSeekStart(fromMs: Long, toMs: Long)
    fun onSeekEnd()
    fun onQualityChange(bitrateBps: Long, width: Int, height: Int)
    fun onDroppedFrames(dropped: Long, rendered: Long)
    fun onError(code: String, fatal: Boolean, message: String)
    fun onHeartbeat(positionMs: Long, bufferedMs: Long, droppedTotal: Long, renderedTotal: Long)
    fun onPlaybackEnd(reason: String)
}

interface PlayerAdapter<TPlayer> {
    fun attach(player: TPlayer, listener: AdapterListener)
    fun detach()
}
