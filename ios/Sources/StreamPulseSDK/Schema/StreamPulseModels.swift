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
    public init(installId: String, platform: Platform, osVersion: String, model: String, networkType: NetworkType) {
        self.installId = installId; self.platform = platform; self.osVersion = osVersion; self.model = model; self.networkType = networkType
    }
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
    public init(type: String, sessionId: String, playId: String, seq: Int, tMonoMs: Int64, tWall: String, data: [String: AnyCodable] = [:]) {
        self.type = type; self.sessionId = sessionId; self.playId = playId; self.seq = seq; self.tMonoMs = tMonoMs; self.tWall = tWall; self.data = data
    }
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
    public init(schemaVersion: String = "1.0", batchId: String, sentAt: String, sdk: SdkInfo, app: AppInfo, device: DeviceInfo, events: [StreamPulseEvent]) {
        self.schemaVersion = schemaVersion; self.batchId = batchId; self.sentAt = sentAt; self.sdk = sdk; self.app = app; self.device = device; self.events = events
    }
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
public struct DynamicCodingKeys: CodingKey, Sendable {
    public var stringValue: String
    public var intValue: Int?
    public init?(stringValue: String) { self.stringValue = stringValue }
    public init?(intValue: Int) { self.intValue = intValue; self.stringValue = "\(intValue)" }
}

public struct AnyCodable: Codable, Sendable, Equatable {
    public let value: AnySendable
    public init(_ value: AnySendable) { self.value = value }
    public init(from decoder: Decoder) throws {
        if let container = try? decoder.container(keyedBy: DynamicCodingKeys.self) {
            var dict: [String: AnyCodable] = [:]
            for key in container.allKeys {
                if let val = try? container.decode(AnyCodable.self, forKey: key) {
                    dict[key.stringValue] = val
                }
            }
            self.value = .object(dict)
            return
        }
        if var arrContainer = try? decoder.unkeyedContainer() {
            var arr: [AnyCodable] = []
            while !arrContainer.isAtEnd {
                if let val = try? arrContainer.decode(AnyCodable.self) {
                    arr.append(val)
                }
            }
            self.value = .array(arr)
            return
        }
        let container = try decoder.singleValueContainer()
        if let boolVal = try? container.decode(Bool.self) { self.value = .bool(boolVal) }
        else if let intVal = try? container.decode(Int64.self) { self.value = .int(intVal) }
        else if let doubleVal = try? container.decode(Double.self) { self.value = .double(doubleVal) }
        else if let strVal = try? container.decode(String.self) { self.value = .string(strVal) }
        else { self.value = .null }
    }
    public func encode(to encoder: Encoder) throws {
        switch value {
        case .bool(let b):
            var c = encoder.singleValueContainer()
            try c.encode(b)
        case .int(let i):
            var c = encoder.singleValueContainer()
            try c.encode(i)
        case .double(let d):
            var c = encoder.singleValueContainer()
            try c.encode(d)
        case .string(let s):
            var c = encoder.singleValueContainer()
            try c.encode(s)
        case .object(let obj):
            var c = encoder.container(keyedBy: DynamicCodingKeys.self)
            for (k, v) in obj {
                if let key = DynamicCodingKeys(stringValue: k) {
                    try c.encode(v, forKey: key)
                }
            }
        case .array(let arr):
            var c = encoder.unkeyedContainer()
            for v in arr {
                try c.encode(v)
            }
        case .null:
            var c = encoder.singleValueContainer()
            try c.encodeNil()
        }
    }
}

public enum AnySendable: Sendable, Equatable {
    case bool(Bool)
    case int(Int64)
    case double(Double)
    case string(String)
    case object([String: AnyCodable])
    case array([AnyCodable])
    case null
}
