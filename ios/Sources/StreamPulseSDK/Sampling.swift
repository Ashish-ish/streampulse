import Foundation

public enum Sampling {
    public static func fnv1a32(_ text: String) -> UInt32 {
        var hash: UInt32 = 0x811c9dc5
        let prime: UInt32 = 0x01000193
        for byte in text.utf8 {
            hash ^= UInt32(byte)
            hash = hash &* prime
        }
        return hash
    }

    public static func isSessionSampled(sessionId: String, sampleRate: Double) -> Bool {
        if sampleRate >= 1.0 { return true }
        if sampleRate <= 0.0 { return false }
        let h = Double(fnv1a32(sessionId))
        return (h / 4294967296.0) < sampleRate
    }
}
