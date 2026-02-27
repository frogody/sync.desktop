import SwiftUI

/// The 3 widget states for the action approval system.
enum WidgetState: String, CaseIterable {
    case idle           // Completely invisible
    case actionPending  // Notification bar: text + approve + dismiss
    case actionSuccess  // Brief green checkmark pulse -> auto-dismiss

    /// Whether the panel should be visible (not hidden/transparent).
    var isVisible: Bool {
        self != .idle
    }

    /// The spring animation to use when transitioning TO this state.
    var transitionAnimation: Animation {
        switch self {
        case .idle:           return .spring(duration: 0.35, bounce: 0.15)
        case .actionPending:  return .spring(duration: 0.4, bounce: 0.25)
        case .actionSuccess:  return .spring(duration: 0.3, bounce: 0.15)
        }
    }

    /// Valid transitions from this state.
    var allowedTransitions: Set<WidgetState> {
        switch self {
        case .idle:
            return [.actionPending]
        case .actionPending:
            return [.idle, .actionSuccess]
        case .actionSuccess:
            return [.idle]
        }
    }

    func canTransition(to target: WidgetState) -> Bool {
        allowedTransitions.contains(target)
    }
}
