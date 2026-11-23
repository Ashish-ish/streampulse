import Foundation

extension AnyCodable {
    public var stringValue: String? {
        if case .string(let s) = value { return s }
        return nil
    }
    public var int64Value: Int64? {
        switch value {
        case .int(let i): return i
        case .double(let d): return Int64(d)
        case .string(let s): return Int64(s)
        default: return nil
        }
    }
    public var intValue: Int? {
        int64Value.map { Int($0) }
    }
    public var doubleValue: Double? {
        switch value {
        case .double(let d): return d
        case .int(let i): return Double(i)
        case .string(let s): return Double(s)
        default: return nil
        }
    }
    public var boolValue: Bool? {
        if case .bool(let b) = value { return b }
        return nil
    }
}
