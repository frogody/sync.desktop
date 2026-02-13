import SwiftUI

/// The 8 widget states as defined in the SKILL.md spec.
enum WidgetState: String, CaseIterable {
    case idle           // Completely invisible
    case hovering       // Rainbow ring peek from notch edges
    case compactChat    // Small chat below notch
    case expandedChat   // Full chat panel
    case voiceListening // Voice input active
    case voiceSpeaking  // AI speaking voice response
    case thinking       // AI processing
    case knocking       // AI requesting attention

    /// Whether the panel should be visible (not hidden/transparent).
    var isVisible: Bool {
        self != .idle
    }

    /// The spring animation to use when transitioning TO this state.
    var transitionAnimation: Animation {
        switch self {
        case .idle:           return .spring(duration: 0.35, bounce: 0.15)
        case .hovering:       return .spring(duration: 0.25, bounce: 0.1)
        case .compactChat:    return .spring(duration: 0.45, bounce: 0.2)
        case .expandedChat:   return .spring(duration: 0.5, bounce: 0.2)
        case .voiceListening: return .spring(duration: 0.4, bounce: 0.25)
        case .voiceSpeaking:  return .spring(duration: 0.4, bounce: 0.25)
        case .thinking:       return .spring(duration: 0.4, bounce: 0.15)
        case .knocking:       return .spring(duration: 0.3, bounce: 0.5)
        }
    }

    /// Valid transitions from this state.
    var allowedTransitions: Set<WidgetState> {
        switch self {
        case .idle:
            return [.hovering, .knocking, .voiceListening, .compactChat]
        case .hovering:
            return [.idle, .compactChat, .voiceListening]
        case .compactChat:
            return [.idle, .hovering, .expandedChat, .thinking, .voiceListening]
        case .expandedChat:
            return [.idle, .compactChat, .thinking, .voiceListening]
        case .voiceListening:
            return [.idle, .thinking, .voiceSpeaking, .compactChat]
        case .voiceSpeaking:
            return [.idle, .voiceListening, .compactChat]
        case .thinking:
            return [.compactChat, .expandedChat, .voiceSpeaking, .idle]
        case .knocking:
            return [.idle, .compactChat, .voiceListening]
        }
    }

    func canTransition(to target: WidgetState) -> Bool {
        allowedTransitions.contains(target)
    }
}
