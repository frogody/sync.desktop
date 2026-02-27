import SwiftUI
import AppKit
import Combine

/// Payload for an action displayed in the notch.
struct ActionPayload {
    let id: String
    let title: String
    let subtitle: String?
    let actionType: String
}

/// Central coordinator for the notch widget.
/// Manages state transitions, action lifecycle, and communication with Electron.
@MainActor
final class NotchViewModel: ObservableObject {
    // MARK: - Published State

    @Published var state: WidgetState = .idle

    // Action state
    @Published var currentAction: ActionPayload?

    // Config from Electron
    @Published var isAuthenticated: Bool = false

    // MARK: - Internal State

    private(set) var config: ConfigPayload?
    private let writer: StdoutWriter
    private var autoDismissTimer: DispatchWorkItem?

    // MARK: - Init

    init(writer: StdoutWriter) {
        self.writer = writer
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

        log("State: \(oldState.rawValue) -> \(newState.rawValue)")
    }

    // MARK: - Action Lifecycle

    /// Show an action in the notch (called when Electron sends show_action or MLX detects one)
    func showAction(action: ActionPayload) {
        // Cancel any existing auto-dismiss timer
        autoDismissTimer?.cancel()

        currentAction = action
        transition(to: .actionPending)

        // Auto-dismiss after 60 seconds if no interaction
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, self.state == .actionPending,
                  self.currentAction?.id == action.id else { return }
            self.dismissAction()
        }
        autoDismissTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: work)
    }

    /// User tapped the approve button
    func approveAction() {
        guard let action = currentAction else { return }

        hapticTap(.levelChange)

        // Notify Electron
        writer.send(OutgoingMessage(
            type: "action_approved",
            payload: ["id": .string(action.id)]
        ))

        // Cancel auto-dismiss
        autoDismissTimer?.cancel()
        autoDismissTimer = nil

        // Show success animation
        transition(to: .actionSuccess)

        // Auto-dismiss success after 1.5s
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self = self, self.state == .actionSuccess else { return }
            self.currentAction = nil
            self.transition(to: .idle)
        }
    }

    /// User tapped the dismiss button
    func dismissAction() {
        guard let action = currentAction else { return }

        hapticTap(.generic)

        // Notify Electron
        writer.send(OutgoingMessage(
            type: "action_dismissed",
            payload: ["id": .string(action.id)]
        ))

        // Cancel auto-dismiss
        autoDismissTimer?.cancel()
        autoDismissTimer = nil

        currentAction = nil
        transition(to: .idle)
    }

    /// Hide a specific action (called by Electron when action is invalidated/expired)
    func hideAction(id: String) {
        guard currentAction?.id == id else { return }

        autoDismissTimer?.cancel()
        autoDismissTimer = nil

        currentAction = nil
        transition(to: .idle)
    }

    /// Show action result (called by Electron after execution completes)
    func showActionResult(id: String, success: Bool, message: String?) {
        guard currentAction?.id == id || state == .actionSuccess else { return }

        if success {
            // Already showing success from approveAction, or transition now
            if state != .actionSuccess {
                transition(to: .actionSuccess)
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                    guard let self = self, self.state == .actionSuccess else { return }
                    self.currentAction = nil
                    self.transition(to: .idle)
                }
            }
        } else {
            // On failure, dismiss immediately
            currentAction = nil
            transition(to: .idle)
        }
    }

    // MARK: - Pulse feedback

    @Published var interactionPulse: CGFloat = 0

    private func hapticTap(_ pattern: NSHapticFeedbackManager.FeedbackPattern = .generic) {
        NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
        withAnimation(.easeOut(duration: 0.15)) { interactionPulse = 1.0 }
        withAnimation(.easeOut(duration: 0.4).delay(0.15)) { interactionPulse = 0 }
    }

    // MARK: - Config Updates from Electron

    func updateConfig(_ payload: ConfigPayload) {
        config = payload
        isAuthenticated = !payload.accessToken.isEmpty
    }

    // MARK: - Logging

    private func log(_ message: String) {
        writer.send(OutgoingMessage(
            type: "log",
            payload: ["level": .string("info"), "message": .string(message)]
        ))
    }
}
