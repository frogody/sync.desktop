import Foundation
import Metal
import MLX
import MLXLLM
import MLXLMCommon

// ============================================================================
// Classification Result
// ============================================================================

struct ActionClassification {
    let actionable: Bool
    let actionType: String      // calendar_event, task_create, email_reply, reminder, none
    let title: String           // Max ~50 chars for notch display
    let confidence: Float
}

// ============================================================================
// Protocol
// ============================================================================

protocol ActionClassifierProtocol {
    func classify(event: ContextEventPayload) async -> ActionClassification?
}

// ============================================================================
// MLX Action Classifier
// ============================================================================

/// Runs a quantized LLM locally via MLX for instant action classification.
/// Model is loaded once on startup and kept in memory for <300ms inference.
///
/// # Model Setup
/// Download and convert Qwen2.5-1.5B-Instruct for MLX:
/// ```
/// pip install mlx-lm
/// python -m mlx_lm.convert --hf-path Qwen/Qwen2.5-1.5B-Instruct -q --q-bits 4
/// ```
/// Copy the output directory contents to: `native/SYNCWidget/Resources/model/`
/// Required files: config.json, tokenizer.json, tokenizer_config.json, *.safetensors
final class MLXActionClassifier: ActionClassifierProtocol {
    private var modelContainer: ModelContainer?
    private let inferenceQueue = DispatchQueue(label: "com.isyncso.widget.mlx", qos: .userInitiated)
    private var isLoaded = false
    private let log: (String) -> Void

    init(log: @escaping (String) -> Void) {
        self.log = log
    }

    // MARK: - Model Loading

    /// Load the model asynchronously. Call once on startup.
    func loadModel() async -> Bool {
        // Metal must be available for MLX inference
        guard let device = MTLCreateSystemDefaultDevice() else {
            log("Metal GPU not available — skipping MLX model load")
            return false
        }

        // Test Metal shader compilation — MLX calls fatalError() if this fails,
        // which bypasses Swift try/catch. We test with a trivial shader first.
        do {
            let trivialSource = "kernel void noop(device float *a [[buffer(0)]], uint i [[thread_position_in_grid]]) { a[i] = a[i]; }"
            let _ = try await device.makeLibrary(source: trivialSource, options: nil)
            log("Metal shader compilation OK")
        } catch {
            log("Metal shader compilation failed — skipping MLX: \(error.localizedDescription)")
            return false
        }

        let modelPath = self.resolveModelPath()

        guard let modelPath = modelPath else {
            log("MLX model not found in Resources/model/")
            return false
        }

        log("Loading MLX model from: \(modelPath)")

        do {
            let container = try await loadModelContainer(
                directory: URL(fileURLWithPath: modelPath)
            )
            self.modelContainer = container
            self.isLoaded = true
            log("MLX model loaded successfully")
            return true
        } catch {
            log("Failed to load MLX model: \(error.localizedDescription)")
            return false
        }
    }

    private func resolveModelPath() -> String? {
        // Check bundled Resources/model/ directory
        if let resourceURL = Bundle.main.resourceURL {
            let modelDir = resourceURL.appendingPathComponent("model")
            let configFile = modelDir.appendingPathComponent("config.json")
            if FileManager.default.fileExists(atPath: configFile.path) {
                return modelDir.path
            }
        }

        // Development fallback: check relative to executable
        let executableURL = URL(fileURLWithPath: ProcessInfo.processInfo.arguments[0])
        let devModelDir = executableURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources")
            .appendingPathComponent("model")
        let devConfigFile = devModelDir.appendingPathComponent("config.json")
        if FileManager.default.fileExists(atPath: devConfigFile.path) {
            return devModelDir.path
        }

        return nil
    }

    // MARK: - Classification

    func classify(event: ContextEventPayload) async -> ActionClassification? {
        guard let container = modelContainer, isLoaded else {
            return nil
        }

        let prompt = buildPrompt(event: event)

        do {
            let output = try await container.perform { (context: ModelContext) async throws -> String in
                let userInput = UserInput(prompt: .text(prompt))
                let lmInput = try await context.processor.prepare(input: userInput)

                let generateParams = GenerateParameters(
                    maxTokens: 150,
                    temperature: 0.1
                )

                var outputText = ""
                for try await generation in try MLXLMCommon.generate(
                    input: lmInput,
                    parameters: generateParams,
                    context: context
                ) {
                    if let chunk = generation.chunk {
                        outputText += chunk
                    }
                }

                return outputText
            }

            return parseResponse(output)
        } catch {
            log("MLX inference error: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Task Detection Rules

    /// Rule-based pre-check for task-worthy moments before LLM inference.
    /// Returns a hint string appended to the prompt, or nil if no rules matched.
    private func detectTaskSignals(event: ContextEventPayload) -> String? {
        let summary = event.summary.lowercased()
        let windowTitle = event.source.windowTitle.lowercased()
        let app = event.source.application.lowercased()
        let combined = "\(summary) \(windowTitle)"

        var signals: [String] = []

        // 1. Email/message with action words
        let actionPatterns = [
            "please review", "can you send", "could you", "by friday", "by monday",
            "by tomorrow", "by end of day", "by eod", "deadline", "asap", "urgent",
            "reminder", "follow up", "follow-up", "action required", "action needed",
            "please confirm", "let me know", "waiting for", "don't forget", "do not forget",
            "make sure to", "need you to", "assigned to you", "your task"
        ]
        for pattern in actionPatterns {
            if combined.contains(pattern) {
                signals.append("ACTION_WORDS: detected '\(pattern)' — likely a direct request or deadline")
                break
            }
        }

        // 2. Calendar events starting soon (prep reminder)
        if event.eventType == "calendar_event" || app.contains("calendar") || app.contains("outlook") {
            if combined.contains("in 30 min") || combined.contains("in 15 min") ||
               combined.contains("starting soon") || combined.contains("starts at") {
                signals.append("MEETING_PREP: calendar event starting soon — suggest prep reminder")
            }
        }

        // 3. @mentions or direct requests in messaging apps
        let messagingApps = ["slack", "teams", "discord", "whatsapp", "messages", "telegram"]
        let isMessaging = messagingApps.contains(where: { app.contains($0) })
        if isMessaging {
            if combined.contains("@") || combined.contains("mentioned you") ||
               combined.contains("direct message") || combined.contains("replied to you") {
                signals.append("MENTION: @mention or direct message detected in messaging app")
            }
        }

        // 4. Repeated context switches to same document (may indicate being stuck)
        if event.eventType == "context_switch" || event.eventType == "repeated_focus" {
            signals.append("CONTEXT_SWITCH: repeated focus on same content — may need a task to track progress")
        }

        return signals.isEmpty ? nil : "TASK DETECTION SIGNALS:\n" + signals.joined(separator: "\n")
    }

    // MARK: - Prompt Construction

    private func buildPrompt(event: ContextEventPayload) -> String {
        var eventInfo = "Event Type: \(event.eventType)\n"
        eventInfo += "Summary: \(event.summary)\n"
        eventInfo += "App: \(event.source.application)\n"
        eventInfo += "Window: \(event.source.windowTitle)\n"

        if !event.entities.isEmpty {
            eventInfo += "Entities: \(event.entities.joined(separator: ", "))\n"
        }

        if let intent = event.intent {
            eventInfo += "Intent: \(intent)\n"
        }

        if !event.commitments.isEmpty {
            let commitmentDescs = event.commitments.compactMap { dict -> String? in
                dict["description"]?.stringValue
            }
            if !commitmentDescs.isEmpty {
                eventInfo += "Commitments: \(commitmentDescs.joined(separator: "; "))\n"
            }
        }

        let taskSignals = detectTaskSignals(event: event)
        let signalBlock = taskSignals.map { "\n\n<task_signals>\n\($0)\n</task_signals>" } ?? ""

        return """
        You are a business task detector. Analyze the user's activity and determine if there is a REAL BUSINESS TASK that a working professional would add to their to-do list.

        ACTIONABLE tasks are things like:
        - Following up with a client or colleague
        - Reviewing or sending a proposal/invoice/contract
        - Preparing for a meeting
        - Responding to an important email
        - Completing a deadline-driven deliverable
        - Making a phone call that was mentioned

        NOT actionable (always return actionable:false):
        - Browsing, reading, or researching
        - Routine app usage (coding, designing, writing)
        - System processes (compilation, downloads, updates)
        - Switching between apps or tabs
        - Watching videos or reading documentation
        - Any developer tooling activity (builds, tests, deploys)

        <context>
        \(eventInfo)
        </context>\(signalBlock)

        Respond ONLY with JSON, no other text:
        {"actionable":true/false,"type":"calendar_event|task_create|email_reply|reminder|none","title":"max 50 char human-readable task description","confidence":0.0-1.0}
        """
    }

    // MARK: - Response Parsing

    private func parseResponse(_ response: String) -> ActionClassification? {
        // Extract JSON from response (model might include surrounding text)
        guard let jsonStart = response.firstIndex(of: "{"),
              let jsonEnd = response.lastIndex(of: "}") else {
            log("MLX response has no JSON: \(response.prefix(100))")
            return nil
        }

        let jsonString = String(response[jsonStart...jsonEnd])
        guard let data = jsonString.data(using: .utf8) else { return nil }

        do {
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return nil
            }

            guard let actionable = json["actionable"] as? Bool else {
                log("MLX response missing 'actionable' field")
                return nil
            }

            let actionType = json["type"] as? String ?? "none"
            let title = json["title"] as? String ?? ""
            let confidence: Float

            if let c = json["confidence"] as? Double {
                confidence = Float(c)
            } else if let c = json["confidence"] as? Float {
                confidence = c
            } else {
                confidence = actionable ? 0.7 : 0.3
            }

            return ActionClassification(
                actionable: actionable,
                actionType: actionType,
                title: String(title.prefix(60)),
                confidence: confidence
            )
        } catch {
            log("MLX JSON parse error: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Semantic Classification

    /// Classify a context event into the activity taxonomy using MLX inference.
    func classifySemantic(payload: SemanticClassifyPayload) async -> [String: AnyCodableValue]? {
        guard let container = modelContainer, isLoaded else { return nil }

        let prompt = buildSemanticPrompt(payload: payload)

        do {
            let output = try await container.perform { (context: ModelContext) async throws -> String in
                let userInput = UserInput(prompt: .text(prompt))
                let lmInput = try await context.processor.prepare(input: userInput)

                let generateParams = GenerateParameters(
                    maxTokens: 80,
                    temperature: 0.1
                )

                var outputText = ""
                for try await generation in try MLXLMCommon.generate(
                    input: lmInput,
                    parameters: generateParams,
                    context: context
                ) {
                    if let chunk = generation.chunk {
                        outputText += chunk
                    }
                }

                return outputText
            }

            return parseSemanticResponse(output, requestId: payload.requestId, task: payload.task)
        } catch {
            log("MLX semantic inference error: \(error.localizedDescription)")
            return nil
        }
    }

    private func buildSemanticPrompt(payload: SemanticClassifyPayload) -> String {
        switch payload.task {
        case "thread_label":
            return """
            Generate a short label (3-6 words) for this work thread.

            Activities: \(payload.summary)
            Key entities: \(payload.entities.joined(separator: ", "))

            Respond ONLY with JSON: {"label":"short descriptive label","confidence":0.0-1.0}
            """

        case "intent_classify":
            return """
            Based on this activity sequence, what is the user's likely intent?

            Thread activities:
            \(payload.summary)

            Entities involved: \(payload.entities.joined(separator: ", "))
            Thread duration: \(payload.windowTitle)

            Intents: SHIP (delivering features/fixes), MANAGE (coordinating/reviewing), PLAN (designing/architecting), MAINTAIN (refactoring/updating), RESPOND (handling requests/issues)

            Respond ONLY with JSON: {"intent":"TYPE","subtype":"specific","confidence":0.0-1.0,"evidence":["reason"]}
            """

        default: // activity_classify
            return """
            Classify this work activity into exactly one category.

            App: \(payload.application)
            Window: \(payload.windowTitle)
            Summary: \(payload.summary)
            Entities: \(payload.entities.joined(separator: ", "))
            Current guess: \(payload.ruleActivityType ?? "unknown") / \(payload.ruleActivitySubtype ?? "unknown")

            Categories: BUILDING (coding/debugging/designing/writing/composing), INVESTIGATING (reading/searching/reviewing/analyzing/learning), COMMUNICATING (messaging/emailing/meeting/presenting/calling), ORGANIZING (planning/filing/scheduling/documenting/tagging), OPERATING (deploying/monitoring/configuring/testing_infra/updating), CONTEXT_SWITCHING (app_switch/topic_switch/break/interruption)

            Respond ONLY with JSON: {"activityType":"CATEGORY","activitySubtype":"subtype","confidence":0.0-1.0}
            """
        }
    }

    private func parseSemanticResponse(_ response: String, requestId: String, task: String = "activity_classify") -> [String: AnyCodableValue]? {
        guard let jsonStart = response.firstIndex(of: "{"),
              let jsonEnd = response.lastIndex(of: "}") else {
            log("Semantic response has no JSON: \(response.prefix(100))")
            return nil
        }

        let jsonString = String(response[jsonStart...jsonEnd])
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }

        let confidence: Double
        if let c = json["confidence"] as? Double { confidence = c }
        else { confidence = 0.7 }

        switch task {
        case "thread_label":
            guard let label = json["label"] as? String else { return nil }
            return [
                "requestId": .string(requestId),
                "task": .string("thread_label"),
                "label": .string(label),
                "confidence": .double(confidence),
            ]

        case "intent_classify":
            guard let intent = json["intent"] as? String else { return nil }
            var result: [String: AnyCodableValue] = [
                "requestId": .string(requestId),
                "task": .string("intent_classify"),
                "intent": .string(intent),
                "confidence": .double(confidence),
            ]
            if let subtype = json["subtype"] as? String {
                result["subtype"] = .string(subtype)
            }
            if let evidence = json["evidence"] as? [String] {
                result["evidence"] = .array(evidence.map { .string($0) })
            }
            return result

        default: // activity_classify
            guard let activityType = json["activityType"] as? String else { return nil }
            return [
                "requestId": .string(requestId),
                "task": .string("activity_classify"),
                "activityType": .string(activityType),
                "activitySubtype": .string(json["activitySubtype"] as? String ?? ""),
                "confidence": .double(confidence),
            ]
        }
    }
}

// ============================================================================
// Fallback Classifier
// ============================================================================

/// When MLX model is unavailable, forwards context events to Electron
/// for server-side classification. Electron's ActionService handles
/// sending to the cloud analyze-action endpoint.
final class FallbackClassifier: ActionClassifierProtocol {
    private let writer: StdoutWriter
    private let log: (String) -> Void

    init(writer: StdoutWriter, log: @escaping (String) -> Void) {
        self.writer = writer
        self.log = log
    }

    func classify(event: ContextEventPayload) async -> ActionClassification? {
        // Send raw event back to Electron for server-side classification.
        // ActionService will forward to the analyze-action edge function.
        writer.send(OutgoingMessage(
            type: "action_detected",
            payload: [
                "id": .string(UUID().uuidString),
                "eventHash": .string(generateEventHash(event)),
                "title": .string(String(event.summary.prefix(50))),
                "actionType": .string(inferBasicType(event)),
                "confidence": .double(0.0),  // 0 signals "needs cloud validation"
                "localPayload": .dictionary([
                    "eventType": .string(event.eventType),
                    "summary": .string(event.summary),
                    "source": .string(event.source.application),
                ]),
            ]
        ))
        log("Fallback: forwarded event to Electron for cloud classification")
        return nil  // Don't show locally -- let cloud decide
    }

    private func generateEventHash(_ event: ContextEventPayload) -> String {
        let input = "\(event.eventType)|\(event.source.application)|\(event.summary)"
        // Simple hash -- real dedup uses SHA256 in ActionService
        var hash: UInt64 = 5381
        for byte in input.utf8 {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return String(hash, radix: 16)
    }

    private func inferBasicType(_ event: ContextEventPayload) -> String {
        switch event.eventType {
        case "commitment_detected": return "reminder"
        case "communication_event": return "email_reply"
        default: return "task_create"
        }
    }
}
