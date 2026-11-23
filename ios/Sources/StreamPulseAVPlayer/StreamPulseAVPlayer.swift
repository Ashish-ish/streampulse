import Foundation
import AVFoundation
import StreamPulseSDK

public final class StreamPulseAVPlayer: NSObject, PlayerAdapter, @unchecked Sendable {
    private weak var player: AVPlayer?
    private weak var listener: PlayerListener?
    private var timeControlObserver: NSKeyValueObservation?
    private var notificationTokens: [NSObjectProtocol] = []

    private var hasReportedFirstFrame = false
    private var isBuffering = false
    private var lastReportedDroppedFrames: Int64 = 0
    private var lastBitrate: Int64 = 0

    public init(player: AVPlayer) {
        self.player = player
        super.init()
    }

    public func attach(listener: PlayerListener) {
        self.listener = listener
        setupObservers()
    }

    public func detach() {
        timeControlObserver?.invalidate()
        timeControlObserver = nil
        for token in notificationTokens {
            NotificationCenter.default.removeObserver(token)
        }
        notificationTokens.removeAll()
        listener = nil
    }

    private func setupObservers() {
        guard let player = player else { return }

        // KVO on timeControlStatus
        timeControlObserver = player.observe(\.timeControlStatus, options: [.initial, .new]) { [weak self] player, _ in
            self?.handleTimeControlStatusChange(player.timeControlStatus)
        }

        // Notification on item events
        let center = NotificationCenter.default

        let stallToken = center.addObserver(
            forName: .AVPlayerItemPlaybackStalled,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handlePlaybackStalled()
        }
        notificationTokens.append(stallToken)

        let jumpToken = center.addObserver(
            forName: .AVPlayerItemTimeJumped,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.listener?.onSeekEnd()
        }
        notificationTokens.append(jumpToken)

        let endToken = center.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.listener?.onPlaybackEnd(reason: .ended)
        }
        notificationTokens.append(endToken)

        let failToken = center.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
            let msg = error?.localizedDescription ?? "Playback failed to play to end time"
            self?.listener?.onError(code: 1001, fatal: true, message: msg)
        }
        notificationTokens.append(failToken)

        let accessLogToken = center.addObserver(
            forName: .AVPlayerItemNewAccessLogEntry,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleAccessLogEntry()
        }
        notificationTokens.append(accessLogToken)
    }

    private func handleTimeControlStatusChange(_ status: AVPlayer.TimeControlStatus) {
        switch status {
        case .waitingToPlayAtSpecifiedRate:
            if !hasReportedFirstFrame {
                listener?.onPlayRequested()
            } else if !isBuffering {
                isBuffering = true
                listener?.onBufferingStart()
            }
        case .playing:
            if !hasReportedFirstFrame {
                hasReportedFirstFrame = true
                listener?.onFirstFrame()
            }
            if isBuffering {
                isBuffering = false
                listener?.onBufferingEnd()
            }
        case .paused:
            break
        @unknown default:
            break
        }
    }

    private func handlePlaybackStalled() {
        if hasReportedFirstFrame && !isBuffering {
            isBuffering = true
            listener?.onBufferingStart()
        }
    }

    private func handleAccessLogEntry() {
        guard let currentItem = player?.currentItem,
              let lastEvent = currentItem.accessLog()?.events.last else { return }

        // Bitrate
        let indicated = Int64(lastEvent.indicatedBitrate)
        let observed = Int64(lastEvent.observedBitrate)
        let effectiveBitrate = indicated > 0 ? indicated : observed
        if effectiveBitrate > 0 && effectiveBitrate != lastBitrate {
            lastBitrate = effectiveBitrate
            listener?.onQualityChange(bitrateBps: effectiveBitrate, width: nil, height: nil)
        }

        // Dropped frames
        let totalDropped = Int64(lastEvent.numberOfDroppedVideoFrames)
        if totalDropped > lastReportedDroppedFrames {
            let delta = totalDropped - lastReportedDroppedFrames
            lastReportedDroppedFrames = totalDropped
            listener?.onDroppedFrames(dropped: delta, rendered: 0)
        }
    }
}
