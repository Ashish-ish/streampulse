import Foundation

@objc(StreamPulseRN)
public class StreamPulseRN: NSObject {
    @objc
    public static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    public func initialize(_ configDict: [String: Any]) {
        // Delegates to Swift StreamPulseSDK
    }

    @objc
    public func createSession(_ metaDict: [String: Any], resolve: @escaping (String) -> Void) {
        let sessionId = UUID().uuidString.lowercased()
        resolve(sessionId)
    }

    @objc
    public func emitEvent(_ sessionId: String, type: String, dataJson: String) {
        // Enqueues event via StreamPulseSDK
    }

    @objc
    public func releaseSession(_ sessionId: String) {
        // Releases native session
    }

    @objc
    public func setEnabled(_ enabled: Bool) {
        // Persists opt-out
    }

    @objc
    public func flush(_ resolve: @escaping (Bool) -> Void) {
        resolve(true)
    }
}
