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

            case .actionPending:
                ActionPendingView(viewModel: viewModel, geometry: geometry)

            case .actionSuccess:
                ActionSuccessView(geometry: geometry)
            }
        }
        .animation(
            reduceMotion ? .none : viewModel.state.transitionAnimation,
            value: viewModel.state
        )
    }
}
