import Foundation

// MARK: - Incoming Messages (Electron -> Swift via stdin)

struct IncomingMessage: Codable {
    let type: String
    let payload: [String: AnyCodableValue]

    init(type: String, payload: [String: AnyCodableValue] = [:]) {
        self.type = type
        self.payload = payload
    }
}

// MARK: - Outgoing Messages (Swift -> Electron via stdout)

struct OutgoingMessage: Codable {
    let type: String
    let payload: [String: AnyCodableValue]

    init(type: String, payload: [String: AnyCodableValue] = [:]) {
        self.type = type
        self.payload = payload
    }
}

// MARK: - Config Payload (extracted from IncomingMessage)

struct ConfigPayload {
    let supabaseUrl: String
    let anonKey: String
    let accessToken: String
    let userId: String
    let userEmail: String
    let userName: String
    let companyId: String
    let sessionId: String

    init?(from payload: [String: AnyCodableValue]) {
        guard case .string(let url) = payload["supabaseUrl"],
              case .string(let key) = payload["anonKey"],
              case .string(let token) = payload["accessToken"],
              case .string(let uid) = payload["userId"],
              case .string(let email) = payload["userEmail"]
        else { return nil }

        self.supabaseUrl = url
        self.anonKey = key
        self.accessToken = token
        self.userId = uid
        self.userEmail = email
        self.userName = (payload["userName"]?.stringValue) ?? ""
        self.companyId = (payload["companyId"]?.stringValue) ?? ""
        self.sessionId = (payload["sessionId"]?.stringValue) ?? "sync_user_\(uid)"
    }
}

// MARK: - Context Payload (extracted from IncomingMessage)

struct ContextPayload {
    let currentApp: String
    let focusScore: Double
    let isIdle: Bool
    let recentApps: [String]
    let recentActivity: String

    init?(from payload: [String: AnyCodableValue]) {
        self.currentApp = payload["currentApp"]?.stringValue ?? ""
        self.focusScore = payload["focusScore"]?.doubleValue ?? 0
        self.isIdle = payload["isIdle"]?.boolValue ?? false
        self.recentApps = payload["recentApps"]?.stringArrayValue ?? []
        self.recentActivity = payload["recentActivity"]?.stringValue ?? ""
    }
}

// MARK: - Type-erased Codable value for flexible JSON

enum AnyCodableValue: Codable, Equatable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case array([AnyCodableValue])
    case dictionary([String: AnyCodableValue])
    case null

    var stringValue: String? {
        if case .string(let v) = self { return v }
        return nil
    }

    var doubleValue: Double? {
        switch self {
        case .double(let v): return v
        case .int(let v): return Double(v)
        default: return nil
        }
    }

    var boolValue: Bool? {
        if case .bool(let v) = self { return v }
        return nil
    }

    var stringArrayValue: [String]? {
        guard case .array(let arr) = self else { return nil }
        return arr.compactMap { $0.stringValue }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let v = try? container.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? container.decode(Int.self) {
            self = .int(v)
        } else if let v = try? container.decode(Double.self) {
            self = .double(v)
        } else if let v = try? container.decode(String.self) {
            self = .string(v)
        } else if let v = try? container.decode([AnyCodableValue].self) {
            self = .array(v)
        } else if let v = try? container.decode([String: AnyCodableValue].self) {
            self = .dictionary(v)
        } else {
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .bool(let v): try container.encode(v)
        case .array(let v): try container.encode(v)
        case .dictionary(let v): try container.encode(v)
        case .null: try container.encodeNil()
        }
    }
}

// Convenience initializers for building payloads
extension AnyCodableValue: ExpressibleByStringLiteral {
    init(stringLiteral value: String) { self = .string(value) }
}

extension AnyCodableValue: ExpressibleByIntegerLiteral {
    init(integerLiteral value: Int) { self = .int(value) }
}

extension AnyCodableValue: ExpressibleByFloatLiteral {
    init(floatLiteral value: Double) { self = .double(value) }
}

extension AnyCodableValue: ExpressibleByBooleanLiteral {
    init(booleanLiteral value: Bool) { self = .bool(value) }
}
