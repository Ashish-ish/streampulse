import Foundation

public struct StreamPulseConfig: Sendable {
    public let endpoint: URL
    public let appId: String
    public let appVersion: String
    public let appBuild: String
    public let sampleRate: Double
    public let flushIntervalMs: Int
    public let maxBatchSize: Int
    public let maxQueueBytes: Int
    public let debug: Bool

    public init(
        endpoint: URL,
        appId: String,
        appVersion: String = "1.0.0",
        appBuild: String = "1",
        sampleRate: Double = 1.0,
        flushIntervalMs: Int = 15000,
        maxBatchSize: Int = 20,
        maxQueueBytes: Int = 5 * 1024 * 1024,
        debug: Bool = false
    ) {
        self.endpoint = endpoint
        self.appId = appId
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.sampleRate = sampleRate
        self.flushIntervalMs = flushIntervalMs
        self.maxBatchSize = maxBatchSize
        self.maxQueueBytes = maxQueueBytes
        self.debug = debug
    }
}

public struct SessionMeta: Sendable {
    public let contentId: String?
    public let streamType: StreamType
    public let protocolType: ProtocolType
    public let player: PlayerInfo
    public let cdn: String?

    public init(
        contentId: String? = nil,
        streamType: StreamType = .vod,
        protocolType: ProtocolType = .hls,
        player: PlayerInfo = PlayerInfo(name: "AVPlayer", version: "1.0"),
        cdn: String? = nil
    ) {
        self.contentId = contentId
        self.streamType = streamType
        self.protocolType = protocolType
        self.player = player
        self.cdn = cdn
    }
}

public protocol PlayerListener: AnyObject, Sendable {
    func onPlayRequested()
    func onFirstFrame()
    func onBufferingStart()
    func onBufferingEnd()
    func onSeekStart()
    func onSeekEnd()
    func onQualityChange(bitrateBps: Int64, width: Int?, height: Int?)
    func onDroppedFrames(dropped: Int64, rendered: Int64)
    func onError(code: Int, fatal: Bool, message: String)
    func onPlaybackEnd(reason: PlaybackEndReason)
}

public protocol PlayerAdapter: AnyObject, Sendable {
    func attach(listener: PlayerListener)
    func detach()
}

public final class StreamPulseSession: PlayerListener, @unchecked Sendable {
    public let sessionId: String
    public let playId: String
    private let config: StreamPulseConfig
    private let meta: SessionMeta
    private let queue: EventQueue
    private let breadcrumbs: BreadcrumbStore
    private weak var adapter: PlayerAdapter?

    private let lock = NSLock()
    private var seq: Int = 0
    private var heartbeatTimer: Timer?
    private var hasFirstFrame = false
    private var isBuffering = false
    private var isSeeking = false
    private var isReleased = false
    private let isSampled: Bool

    init(
        sessionId: String = UUID().uuidString.lowercased(),
        playId: String = UUID().uuidString.lowercased(),
        config: StreamPulseConfig,
        meta: SessionMeta,
        queue: EventQueue,
        breadcrumbs: BreadcrumbStore,
        adapter: PlayerAdapter?
    ) {
        self.sessionId = sessionId
        self.playId = playId
        self.config = config
        self.meta = meta
        self.queue = queue
        self.breadcrumbs = breadcrumbs
        self.adapter = adapter
        self.isSampled = Sampling.isSessionSampled(sessionId: sessionId, sampleRate: config.sampleRate)

        if isSampled {
            emitSessionStart()
            startHeartbeat()
        }
    }

    public func release() {
        lock.lock()
        defer { lock.unlock() }
        if isReleased { return }
        isReleased = true
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        adapter?.detach()
    }

    private func emitSessionStart() {
        var data: [String: AnyCodable] = [
            "stream_type": AnyCodable(.string(meta.streamType.rawValue)),
            "protocol": AnyCodable(.string(meta.protocolType.rawValue)),
            "player_name": AnyCodable(.string(meta.player.name)),
            "player_version": AnyCodable(.string(meta.player.version))
        ]
        if let cid = meta.contentId {
            data["content_id"] = AnyCodable(.string(cid))
        }
        if let cdn = meta.cdn {
            data["cdn"] = AnyCodable(.string(cdn))
        }
        emit("session_start", data: data)
    }

    private func emit(_ type: String, data: [String: AnyCodable] = [:]) {
        guard isSampled else { return }
        lock.lock()
        let currentSeq = seq
        seq += 1
        lock.unlock()

        let monoMs = Int64(ProcessInfo.processInfo.systemUptime * 1000)
        let wallIso = ISO8601DateFormatter().string(from: Date())

        let event = StreamPulseEvent(
            type: type,
            sessionId: sessionId,
            playId: playId,
            seq: currentSeq,
            tMonoMs: monoMs,
            tWall: wallIso,
            data: data
        )
        queue.enqueue(event)
        breadcrumbs.save(sessionId: sessionId, monoMs: monoMs)
    }

    private func startHeartbeat() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
                self?.emitHeartbeat()
            }
        }
    }

    private func emitHeartbeat() {
        emit("heartbeat", data: [
            "position_ms": AnyCodable(.int(0)),
            "buffered_ms": AnyCodable(.int(0))
        ])
    }

    // MARK: - PlayerListener Callbacks
    public func onPlayRequested() {
        emit("play_requested")
    }

    public func onFirstFrame() {
        lock.lock()
        hasFirstFrame = true
        lock.unlock()
        emit("first_frame")
    }

    public func onBufferingStart() {
        lock.lock()
        if isReleased || isBuffering { lock.unlock(); return }
        isBuffering = true
        lock.unlock()
        emit("buffering_start")
    }

    public func onBufferingEnd() {
        lock.lock()
        if isReleased || !isBuffering { lock.unlock(); return }
        isBuffering = false
        lock.unlock()
        emit("buffering_end")
    }

    public func onSeekStart() {
        lock.lock()
        if isReleased || isSeeking { lock.unlock(); return }
        isSeeking = true
        lock.unlock()
        emit("seek_start")
    }

    public func onSeekEnd() {
        lock.lock()
        if isReleased || !isSeeking { lock.unlock(); return }
        isSeeking = false
        lock.unlock()
        emit("seek_end")
    }

    public func onQualityChange(bitrateBps: Int64, width: Int?, height: Int?) {
        var data: [String: AnyCodable] = ["bitrate_bps": AnyCodable(.int(bitrateBps))]
        if let w = width { data["width"] = AnyCodable(.int(Int64(w))) }
        if let h = height { data["height"] = AnyCodable(.int(Int64(h))) }
        emit("quality_change", data: data)
    }

    public func onDroppedFrames(dropped: Int64, rendered: Int64) {
        emit("dropped_frames", data: [
            "dropped": AnyCodable(.int(dropped)),
            "rendered": AnyCodable(.int(rendered))
        ])
    }

    public func onError(code: Int, fatal: Bool, message: String) {
        let scrubbed = Scrubber.scrub(message: message)
        emit("playback_error", data: [
            "code": AnyCodable(.int(Int64(code))),
            "fatal": AnyCodable(.bool(fatal)),
            "message": AnyCodable(.string(scrubbed))
        ])
        if fatal {
            onPlaybackEnd(reason: .error)
        }
    }

    public func onPlaybackEnd(reason: PlaybackEndReason) {
        lock.lock()
        let wasBuffering = isBuffering
        let wasSeeking = isSeeking
        isBuffering = false
        isSeeking = false
        lock.unlock()

        if wasBuffering { emit("buffering_end") }
        if wasSeeking { emit("seek_end") }

        emit("playback_end", data: [
            "reason": AnyCodable(.string(reason.rawValue))
        ])
        release()
    }
}

public final class StreamPulse: @unchecked Sendable {
    public static let shared = StreamPulse()

    private let lock = NSLock()
    private var config: StreamPulseConfig?
    private let queue = EventQueue()
    private let breadcrumbs = BreadcrumbStore()
    private var transport: Transport?
    private var isEnabled = true
    private var installId: String = UUID().uuidString.lowercased()

    private init() {}

    public static func initialize(config: StreamPulseConfig) {
        shared.lock.lock()
        defer { shared.lock.unlock() }
        shared.config = config
        shared.transport = Transport(endpoint: config.endpoint)
    }

    public static func setEnabled(_ enabled: Bool) {
        shared.lock.lock()
        defer { shared.lock.unlock() }
        shared.isEnabled = enabled
        if !enabled {
            shared.queue.clear()
        }
    }

    public static func attach(
        player: Any,
        adapter: PlayerAdapter,
        sessionMeta: SessionMeta
    ) -> StreamPulseSession? {
        shared.lock.lock()
        guard shared.isEnabled, let cfg = shared.config else {
            shared.lock.unlock()
            return nil
        }
        let queue = shared.queue
        let breadcrumbs = shared.breadcrumbs
        shared.lock.unlock()

        let session = StreamPulseSession(
            config: cfg,
            meta: sessionMeta,
            queue: queue,
            breadcrumbs: breadcrumbs,
            adapter: adapter
        )
        adapter.attach(listener: session)
        return session
    }

    public static func flush(completion: ((Bool) -> Void)? = nil) {
        shared.lock.lock()
        guard shared.isEnabled,
              let cfg = shared.config,
              let transport = shared.transport else {
            shared.lock.unlock()
            completion?(false)
            return
        }

        let events = shared.queue.peek(count: cfg.maxBatchSize)
        guard !events.isEmpty else {
            shared.lock.unlock()
            completion?(true)
            return
        }
        let count = events.count
        let installId = shared.installId
        shared.lock.unlock()

        let batch = StreamPulseBatch(
            schemaVersion: "1.0",
            batchId: UUID().uuidString.lowercased(),
            sentAt: ISO8601DateFormatter().string(from: Date()),
            sdk: SdkInfo(name: "streampulse-ios", version: "0.1.0"),
            app: AppInfo(id: cfg.appId, version: cfg.appVersion, build: cfg.appBuild),
            device: DeviceInfo(
                installId: installId,
                platform: .ios,
                osVersion: "iOS 17.0",
                model: "iPhone",
                networkType: .wifi
            ),
            events: events
        )

        transport.sendBatch(batch) { result in
            switch result {
            case .success:
                shared.queue.remove(count: count)
                completion?(true)
            case .failure:
                completion?(false)
            }
        }
    }
}
