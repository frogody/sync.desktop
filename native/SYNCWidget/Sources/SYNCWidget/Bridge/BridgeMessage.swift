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

// MARK: - Context Event Payload (individual events for MLX classification)

struct ContextEventPayload {
    let eventType: String
    let summary: String
    let entities: [String]
    let commitments: [[String: AnyCodableValue]]
    let intent: String?
    let source: ContextEventSource
    let confidence: Double
    let timestamp: Double

    struct ContextEventSource {
        let application: String
        let windowTitle: String
        let url: String?
        let filePath: String?
    }

    init?(from payload: [String: AnyCodableValue]) {
        guard let eventType = payload["eventType"]?.stringValue,
              let summary = payload["summary"]?.stringValue
        else { return nil }

        self.eventType = eventType
        self.summary = summary
        self.entities = payload["entities"]?.stringArrayValue ?? []
        self.intent = payload["intent"]?.stringValue
        self.confidence = payload["confidence"]?.doubleValue ?? 0
        self.timestamp = payload["timestamp"]?.doubleValue ?? Date().timeIntervalSince1970 * 1000

        // Parse commitments array
        if case .array(let arr) = payload["commitments"] {
            self.commitments = arr.compactMap { item -> [String: AnyCodableValue]? in
                if case .dictionary(let dict) = item { return dict }
                return nil
            }
        } else {
            self.commitments = []
        }

        // Parse source object
        if case .dictionary(let src) = payload["source"] {
            self.source = ContextEventSource(
                application: src["application"]?.stringValue ?? "",
                windowTitle: src["windowTitle"]?.stringValue ?? "",
                url: src["url"]?.stringValue,
                filePath: src["filePath"]?.stringValue
            )
        } else {
            self.source = ContextEventSource(
                application: payload["currentApp"]?.stringValue ?? "",
                windowTitle: "",
                url: nil,
                filePath: nil
            )
        }
    }
}

// MARK: - Action Payload (from show_action message)

extension ActionPayload {
    init?(from payload: [String: AnyCodableValue]) {
        guard let id = payload["id"]?.stringValue,
              let title = payload["title"]?.stringValue,
              let actionType = payload["actionType"]?.stringValue
        else { return nil }

        self.init(
            id: id,
            title: title,
            subtitle: payload["subtitle"]?.stringValue,
            actionType: actionType
        )
    }
}

// MARK: - Action Result Payload (from action_result message)

struct ActionResultPayload {
    let id: String
    let success: Bool
    let message: String?

    init?(from payload: [String: AnyCodableValue]) {
        guard let id = payload["id"]?.stringValue,
              let success = payload["success"]?.boolValue
        else { return nil }

        self.id = id
        self.success = success
        self.message = payload["message"]?.stringValue
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
