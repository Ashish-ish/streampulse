// Generated automatically from spec/event-schema.v1.json. DO NOT EDIT BY HAND.
import Foundation

public enum Platform: String, Codable, Sendable {
    case android = "android"
    case ios = "ios"
    case web = "web"
    case rn = "rn"
}

public enum NetworkType: String, Codable, Sendable {
    case wifi = "wifi"
    case cellular = "cellular"
    case ethernet = "ethernet"
    case none = "none"
    case unknown = "unknown"
}

public enum StreamType: String, Codable, Sendable {
    case vod = "vod"
    case live = "live"
}

public enum ProtocolType: String, Codable, Sendable {
    case hls = "hls"
    case dash = "dash"
    case progressive = "progressive"
}

public enum PlaybackEndReason: String, Codable, Sendable {
    case ended = "ended"
    case userExit = "user_exit"
    case error = "error"
    case background = "background"
}

public enum AppHealthKind: String, Codable, Sendable {
    case crash = "crash"
    case anr = "anr"
    case hang = "hang"
    case nativeCrash = "native_crash"
}

public struct SdkInfo: Codable, Sendable, Equatable {
    public let name: String
    public let version: String
    public init(name: String, version: String) { self.name = name; self.version = version }
}

public struct AppInfo: Codable, Sendable, Equatable {
    public let id: String
    public let version: String
    public let build: String
    public init(id: String, version: String, build: String) { self.id = id; self.version = version; self.build = build }
}

public struct DeviceInfo: Codable, Sendable, Equatable {
    public let installId: String
    public let platform: Platform
    public let osVersion: String
    public let model: String
    public let networkType: NetworkType
    enum CodingKeys: String, CodingKey {
        case installId = "install_id"
        case platform
        case osVersion = "os_version"
        case model
        case networkType = "network_type"
    }
}

public struct PlayerInfo: Codable, Sendable, Equatable {
    public let name: String
    public let version: String
    public init(name: String, version: String) { self.name = name; self.version = version }
}

public struct StreamPulseEvent: Codable, Sendable, Equatable {
    public let type: String
    public let sessionId: String
    public let playId: String
    public let seq: Int
    public let tMonoMs: Int64
    public let tWall: String
    public let data: [String: AnyCodable]
    enum CodingKeys: String, CodingKey {
        case type
        case sessionId = "session_id"
        case playId = "play_id"
        case seq
        case tMonoMs = "t_mono_ms"
        case tWall = "t_wall"
        case data
    }
}

public struct StreamPulseBatch: Codable, Sendable, Equatable {
    public let schemaVersion: String
    public let batchId: String
    public let sentAt: String
    public let sdk: SdkInfo
    public let app: AppInfo
    public let device: DeviceInfo
    public let events: [StreamPulseEvent]
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case batchId = "batch_id"
        case sentAt = "sent_at"
        case sdk
        case app
        case device
        case events
    }
}

// Lightweight AnyCodable helper for polymorphic event payloads
public struct AnyCodable: Codable, Sendable, Equatable {
    public let value: AnySendable
    public init(_ value: AnySendable) { self.value = value }
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let boolVal = try? container.decode(Bool.self) { self.value = .bool(boolVal) }
        else if let intVal = try? container.decode(Int64.self) { self.value = .int(intVal) }
        else if let doubleVal = try? container.decode(Double.self) { self.value = .double(doubleVal) }
        else if let strVal = try? container.decode(String.self) { self.value = .string(strVal) }
        else { self.value = .null }
    }
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case .bool(let b): try container.encode(b)
        case .int(let i): try container.encode(i)
        case .double(let d): try container.encode(d)
        case .string(let s): try container.encode(s)
        case .null: try container.encodeNil()
        }
    }
}

public enum AnySendable: Sendable, Equatable {
    case bool(Bool)
    case int(Int64)
    case double(Double)
    case string(String)
    case null
}
