import Foundation
#if canImport(MetricKit) && os(iOS)
import MetricKit

@available(iOS 14.0, *)
public final class StreamPulseMetricKitSubscriber: NSObject, MXMetricManagerSubscriber, @unchecked Sendable {
    public static let shared = StreamPulseMetricKitSubscriber()

    private let breadcrumbStore: BreadcrumbStore
    private let queue: EventQueue
    private var isRegistered = false

    public init(breadcrumbStore: BreadcrumbStore = BreadcrumbStore(), queue: EventQueue = EventQueue()) {
        self.breadcrumbStore = breadcrumbStore
        self.queue = queue
        super.init()
    }

    public func register() {
        guard !isRegistered else { return }
        MXMetricManager.shared.add(self)
        isRegistered = true
    }

    public func unregister() {
        guard isRegistered else { return }
        MXMetricManager.shared.remove(self)
        isRegistered = false
    }

    public func didReceive(_ payloads: [MXMetricPayload]) {
        // Daily metrics rollups; StreamPulse focuses on immediate diagnostic events
    }

    public func didReceive(_ payloads: [MXDiagnosticPayload]) {
        guard let breadcrumb = breadcrumbStore.read() else { return }

        for payload in payloads {
            // Check crash diagnostics
            if let crashes = payload.crashDiagnostics, !crashes.isEmpty {
                emitHealthEvent(kind: "crash", sessionId: breadcrumb.sessionId)
            }

            // Check hang diagnostics
            if let hangs = payload.hangDiagnostics, !hangs.isEmpty {
                emitHealthEvent(kind: "hang", sessionId: breadcrumb.sessionId)
            }
        }
    }

    private func emitHealthEvent(kind: String, sessionId: String) {
        let monoMs = Int64(ProcessInfo.processInfo.systemUptime * 1000)
        let wallIso = ISO8601DateFormatter().string(from: Date())

        let event = StreamPulseEvent(
            type: "app_health",
            sessionId: sessionId,
            playId: UUID().uuidString.lowercased(),
            seq: 0,
            tMonoMs: monoMs,
            tWall: wallIso,
            data: [
                "kind": AnyCodable(.string(kind)),
                "session_id": AnyCodable(.string(sessionId))
            ]
        )
        queue.enqueue(event)
    }
}
#endif
