import Foundation
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

        return """
        Analyze this user activity and determine if there's an actionable task the user should be reminded about.

        <context>
        \(eventInfo)
        </context>

        Is this actionable? Respond ONLY with JSON, no other text:
        {"actionable":true/false,"type":"calendar_event|task_create|email_reply|reminder|none","title":"max 50 char notification text","confidence":0.0-1.0}
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
