import SwiftUI
import AppKit
import Combine

/// Central coordinator for the notch widget.
/// Manages state transitions, mouse proximity, and communication with Electron.
@MainActor
final class NotchViewModel: ObservableObject {
    // MARK: - Published State

    @Published var state: WidgetState = .idle
    @Published var proximityIntensity: CGFloat = 0  // 0 (far) to 1 (at notch)
    @Published var isMouseInside: Bool = false

    // Chat state
    @Published var chatMessages: [ChatMessage] = []
    @Published var chatInput: String = ""
    @Published var isStreaming: Bool = false

    // Voice state
    @Published var audioLevel: CGFloat = 0
    @Published var voiceTranscript: String = ""

    // Config from Electron
    @Published var isAuthenticated: Bool = false

    // Context boost: true when widget is active (not idle/hovering)
    @Published var isContextBoosted: Bool = false

    // MARK: - Internal State

    private(set) var config: ConfigPayload?
    private(set) var context: ContextPayload?
    private let writer: StdoutWriter

    // SSE client for chat — lives here so it persists across SwiftUI view re-renders
    let sseClient = SSEClient()

    // Keyboard capture for chat input (CGEventTap — avoids needing panel focus)
    let keyboardCapture = KeyboardCapture()

    // MARK: - Init

    init(writer: StdoutWriter) {
        self.writer = writer
        setupKeyboardCapture()
    }

    private func setupKeyboardCapture() {
        keyboardCapture.onCharacter = { [weak self] chars in
            DispatchQueue.main.async {
                self?.chatInput.append(chars)
            }
        }
        keyboardCapture.onDelete = { [weak self] in
            DispatchQueue.main.async {
                guard let self = self, !self.chatInput.isEmpty else { return }
                self.chatInput.removeLast()
            }
        }
        keyboardCapture.onSubmit = { [weak self] in
            DispatchQueue.main.async {
                self?.sendChatMessage()
            }
        }
        keyboardCapture.onEscape = { [weak self] in
            DispatchQueue.main.async {
                self?.dismiss()
            }
        }
    }

    // MARK: - State Transitions

    func transition(to newState: WidgetState) {
        guard state != newState else { return }

        let oldState = state
        state = newState

        // Notify Electron of state change
        writer.send(OutgoingMessage(
            type: "widget_state",
            payload: ["state": .string(newState.rawValue)]
        ))

        // Manage context boost: active when widget is interactive (not idle/hovering)
        let shouldBoost = newState != .idle && newState != .hovering
        if shouldBoost != isContextBoosted {
            isContextBoosted = shouldBoost
            if shouldBoost {
                writer.send(OutgoingMessage(
                    type: "context_boost",
                    payload: ["interval": .int(1000)]  // 1-second polling
                ))
                // Request immediate context update
                writer.send(OutgoingMessage(type: "request_context", payload: [:]))
            } else {
                writer.send(OutgoingMessage(
                    type: "context_normal",
                    payload: [:]
                ))
            }
        }

        // Start/stop keyboard capture for chat modes
        let needsKeyboard = newState == .compactChat || newState == .expandedChat
        if needsKeyboard && !keyboardCapture.isCapturing {
            keyboardCapture.start()
        } else if !needsKeyboard && keyboardCapture.isCapturing {
            keyboardCapture.stop()
        }

        log("State: \(oldState.rawValue) → \(newState.rawValue)")
    }

    // MARK: - Mouse Proximity

    func updateProximity(distance: CGFloat, maxDistance: CGFloat) {
        let normalized = max(0, min(1, 1 - (distance / maxDistance)))
        proximityIntensity = normalized

        if normalized > 0.01 && state == .idle {
            transition(to: .hovering)
        } else if normalized < 0.01 && state == .hovering {
            transition(to: .idle)
        }
    }

    func mouseEntered() {
        isMouseInside = true
        if state == .idle {
            transition(to: .hovering)
        }
    }

    func mouseExited() {
        isMouseInside = false
        // Only return to idle if we're in hover state (not chat/voice)
        if state == .hovering {
            transition(to: .idle)
        }
    }

    // MARK: - Pulse feedback (brief visual pulse on interaction)

    @Published var interactionPulse: CGFloat = 0

    private func hapticTap(_ pattern: NSHapticFeedbackManager.FeedbackPattern = .generic) {
        NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
        // Brief visual pulse
        withAnimation(.easeOut(duration: 0.15)) { interactionPulse = 1.0 }
        withAnimation(.easeOut(duration: 0.4).delay(0.15)) { interactionPulse = 0 }
    }

    // MARK: - User Actions

    func activateChat() {
        hapticTap(.levelChange)
        transition(to: .compactChat)
    }

    func expandChat() {
        hapticTap(.levelChange)
        transition(to: .expandedChat)
    }

    func activateVoice() {
        hapticTap(.levelChange)
        transition(to: .voiceListening)
    }

    func dismiss() {
        hapticTap(.generic)
        transition(to: .idle)
    }

    func openWebApp() {
        writer.send(OutgoingMessage(
            type: "open_external",
            payload: ["url": .string("https://app.isyncso.com")]
        ))
    }

    // MARK: - Chat

    func sendChatMessage() {
        let text = chatInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }
        guard let config = config else { return }

        let userMsg = ChatMessage(role: .user, content: text, timestamp: Date())
        chatMessages.append(userMsg)
        chatInput = ""

        let assistantMsg = ChatMessage(role: .assistant, content: "", timestamp: Date())
        chatMessages.append(assistantMsg)
        let assistantId = assistantMsg.id
        isStreaming = true

        Task {
            await sseClient.streamChat(
                message: text,
                config: config,
                context: context,
                onChunk: { [weak self] content in
                    Task { @MainActor in
                        guard let self = self else { return }
                        if let idx = self.chatMessages.firstIndex(where: { $0.id == assistantId }) {
                            self.chatMessages[idx].content = content
                        }
                    }
                },
                onComplete: { [weak self] content in
                    Task { @MainActor in
                        guard let self = self else { return }
                        if let idx = self.chatMessages.firstIndex(where: { $0.id == assistantId }) {
                            self.chatMessages[idx].content = content
                        }
                        self.isStreaming = false
                    }
                },
                onError: { [weak self] error in
                    Task { @MainActor in
                        guard let self = self else { return }
                        if let idx = self.chatMessages.firstIndex(where: { $0.id == assistantId }) {
                            self.chatMessages[idx].content = "Error: \(error)"
                        }
                        self.isStreaming = false
                    }
                }
            )
        }
    }

    // MARK: - Config Updates from Electron

    func updateConfig(_ payload: ConfigPayload) {
        config = payload
        isAuthenticated = !payload.accessToken.isEmpty
    }

    func updateContext(_ payload: ContextPayload) {
        context = payload
    }

    // MARK: - Logging

    private func log(_ message: String) {
        writer.send(OutgoingMessage(
            type: "log",
            payload: ["level": .string("info"), "message": .string(message)]
        ))
    }
}

// MARK: - Chat Message Model

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: Role
    var content: String
    let timestamp: Date

    enum Role {
        case user
        case assistant
    }
}
