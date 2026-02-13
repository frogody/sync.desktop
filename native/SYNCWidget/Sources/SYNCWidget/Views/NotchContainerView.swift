import SwiftUI

/// Root SwiftUI view that switches content based on the current widget state.
/// Manages transitions and animations between states.
struct NotchContainerView: View {
    @ObservedObject var viewModel: NotchViewModel
    let geometry: NotchGeometry

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            switch viewModel.state {
            case .idle:
                IdleView()

            case .hovering:
                HoverGlowView(
                    geometry: geometry,
                    intensity: viewModel.proximityIntensity
                )

            case .compactChat:
                CompactChatView(viewModel: viewModel, geometry: geometry)

            case .expandedChat:
                ExpandedChatView(viewModel: viewModel, geometry: geometry)

            case .voiceListening, .voiceSpeaking:
                VoicePillView(viewModel: viewModel, geometry: geometry)

            case .thinking:
                ThinkingView(geometry: geometry)

            case .knocking:
                KnockingView(viewModel: viewModel, geometry: geometry)
            }
        }
        .animation(
            reduceMotion ? .none : viewModel.state.transitionAnimation,
            value: viewModel.state
        )
    }
}
