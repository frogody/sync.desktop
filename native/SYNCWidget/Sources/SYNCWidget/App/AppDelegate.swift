import AppKit
import SwiftUI

final class SYNCWidgetAppDelegate: NSObject, NSApplicationDelegate {
    private var panel: NotchOverlayPanel?
    private var stdinReader: StdinReader?
    private let stdoutWriter = StdoutWriter()
    private var mouseMonitor: MouseMonitor?
    private var viewModel: NotchViewModel?
    private var classifier: ActionClassifierProtocol?
    private var classifierReady = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let geometry = NotchGeometry.detect()

        if geometry.hasNotch {
            log("Notch detected: \(Int(geometry.notchWidth))x\(Int(geometry.notchHeight)) at (\(Int(geometry.notchRect.origin.x)), \(Int(geometry.notchRect.origin.y)))")
        } else {
            log("No notch detected, using top-center fallback")
        }

        // Create the view model
        let vm = NotchViewModel(writer: stdoutWriter)
        self.viewModel = vm

        // Create the overlay panel with the container view
        panel = NotchOverlayPanel(geometry: geometry, viewModel: vm)
        panel?.orderFrontRegardless()

        // Setup mouse proximity tracking
        let monitor = MouseMonitor(geometry: geometry)
        monitor.start()
        self.mouseMonitor = monitor

        // Start stdin reader for Electron bridge
        stdinReader = StdinReader { [weak self] message in
            self?.handleMessage(message)
        }
        stdinReader?.start()

        // Load MLX classifier asynchronously (don't block UI)
        initClassifier()

        // Signal readiness to Electron
        stdoutWriter.send(OutgoingMessage(type: "ready", payload: [:]))
        log("SYNCWidget started")
    }

    func applicationWillTerminate(_ notification: Notification) {
        mouseMonitor?.stop()
        panel?.close()
        log("SYNCWidget shutting down")
    }

    // MARK: - Classifier Init

    private func initClassifier() {
        let mlxClassifier = MLXActionClassifier(log: { [weak self] msg in
            self?.log(msg)
        })

        Task {
            let loaded = await mlxClassifier.loadModel()
            await MainActor.run {
                if loaded {
                    self.classifier = mlxClassifier
                    self.classifierReady = true
                    self.log("Using MLX local classifier")
                } else {
                    self.classifier = FallbackClassifier(
                        writer: self.stdoutWriter,
                        log: { [weak self] msg in self?.log(msg) }
                    )
                    self.classifierReady = true
                    self.log("MLX unavailable, using fallback classifier")
                }
            }
        }
    }

    // MARK: - Message Handling

    @MainActor private func handleMessage(_ message: IncomingMessage) {
        switch message.type {
        case "config":
            if let config = ConfigPayload(from: message.payload) {
                viewModel?.updateConfig(config)
                log("Config received (user: \(config.userEmail))")
            } else {
                log("Failed to parse config payload")
            }

        case "context_event":
            if let event = ContextEventPayload(from: message.payload) {
                classifyEvent(event)
            }

        case "show_action":
            if let action = ActionPayload(from: message.payload) {
                viewModel?.showAction(action: action)
                log("Show action: \(action.title)")
            } else {
                log("Failed to parse show_action payload")
            }

        case "hide_action":
            if let id = message.payload["id"]?.stringValue {
                viewModel?.hideAction(id: id)
                log("Hide action: \(id)")
            }

        case "action_result":
            if let result = ActionResultPayload(from: message.payload) {
                viewModel?.showActionResult(
                    id: result.id,
                    success: result.success,
                    message: result.message
                )
                log("Action result: \(result.id) success=\(result.success)")
            }

        case "shutdown":
            log("Shutdown requested")
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }

        default:
            log("Unknown message type: \(message.type)")
        }
    }

    // MARK: - Event Classification

    private func classifyEvent(_ event: ContextEventPayload) {
        guard classifierReady, let classifier = classifier else {
            log("Classifier not ready, skipping event: \(event.eventType)")
            return
        }

        Task {
            guard let result = await classifier.classify(event: event) else {
                return  // Classifier returned nil (fallback already forwarded, or parse error)
            }

            guard result.actionable else { return }

            let actionId = UUID().uuidString
            let eventHash = generateEventHash(event)

            await MainActor.run {
                if result.confidence > 0.7 {
                    // High confidence: show in notch immediately
                    self.viewModel?.showAction(action: ActionPayload(
                        id: actionId,
                        title: result.title,
                        subtitle: nil,
                        actionType: result.actionType
                    ))
                    self.log("MLX action shown (confidence: \(String(format: "%.2f", result.confidence))): \(result.title)")
                } else if result.confidence > 0.5 {
                    // Medium confidence: don't show locally, send to cloud for validation
                    self.log("MLX action deferred to cloud (confidence: \(String(format: "%.2f", result.confidence))): \(result.title)")
                } else {
                    // Low confidence: discard
                    return
                }

                // Send action_detected to Electron for cloud enrichment
                self.stdoutWriter.send(OutgoingMessage(
                    type: "action_detected",
                    payload: [
                        "id": .string(actionId),
                        "eventHash": .string(eventHash),
                        "title": .string(result.title),
                        "actionType": .string(result.actionType),
                        "confidence": .double(Double(result.confidence)),
                        "localPayload": .dictionary([
                            "eventType": .string(event.eventType),
                            "summary": .string(event.summary),
                            "source": .string(event.source.application),
                            "windowTitle": .string(event.source.windowTitle),
                        ]),
                    ]
                ))
            }
        }
    }

    private func generateEventHash(_ event: ContextEventPayload) -> String {
        // Deterministic fingerprint: type + app + summary + minute-rounded timestamp
        let minuteTimestamp = Int(event.timestamp / 60000) * 60000
        let input = "\(event.eventType)|\(event.source.application)|\(event.summary)|\(minuteTimestamp)"

        // Simple djb2 hash -- real SHA256 dedup happens in ActionService
        var hash: UInt64 = 5381
        for byte in input.utf8 {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return String(hash, radix: 16)
    }

    // MARK: - Logging

    private func log(_ message: String) {
        stdoutWriter.send(OutgoingMessage(
            type: "log",
            payload: ["level": .string("info"), "message": .string(message)]
        ))
    }
}
