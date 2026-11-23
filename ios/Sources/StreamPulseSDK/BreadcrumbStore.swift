import Foundation

public struct SessionBreadcrumb: Codable, Sendable, Equatable {
    public let sessionId: String
    public let updatedAt: String
    public let lastHeartbeatMonoMs: Int64

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case updatedAt = "updated_at"
        case lastHeartbeatMonoMs = "last_heartbeat_mono_ms"
    }
}

public final class BreadcrumbStore: @unchecked Sendable {
    private let fileURL: URL
    private let lock = NSLock()

    public init(fileName: String = "streampulse_breadcrumb.json") {
        let fileManager = FileManager.default
        let baseDir: URL
        if let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            try? fileManager.createDirectory(at: appSupport, withIntermediateDirectories: true)
            baseDir = appSupport
        } else {
            baseDir = URL(fileURLWithPath: NSTemporaryDirectory())
        }
        self.fileURL = baseDir.appendingPathComponent(fileName)
    }

    public func save(sessionId: String, monoMs: Int64) {
        lock.lock()
        defer { lock.unlock() }

        let formatter = ISO8601DateFormatter()
        let breadcrumb = SessionBreadcrumb(
            sessionId: sessionId,
            updatedAt: formatter.string(from: Date()),
            lastHeartbeatMonoMs: monoMs
        )
        if let data = try? JSONEncoder().encode(breadcrumb) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    public func read() -> SessionBreadcrumb? {
        lock.lock()
        defer { lock.unlock() }

        guard let data = try? Data(contentsOf: fileURL),
              let breadcrumb = try? JSONDecoder().decode(SessionBreadcrumb.self, from: data) else {
            return nil
        }
        return breadcrumb
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        try? FileManager.default.removeItem(at: fileURL)
    }
}
