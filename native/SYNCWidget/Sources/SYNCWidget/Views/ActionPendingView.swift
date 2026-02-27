import SwiftUI

/// Dark pill notification extending from the notch area.
/// Shows action title with approve (checkmark) and dismiss (x) buttons.
struct ActionPendingView: View {
    @ObservedObject var viewModel: NotchViewModel
    let geometry: NotchGeometry

    var body: some View {
        HStack(spacing: 0) {
            // Dismiss button (left edge)
            Button(action: { viewModel.dismissAction() }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .buttonStyle(.plain)
            .padding(.leading, 14)

            Spacer(minLength: 12)

            // Action text (centered)
            VStack(spacing: 2) {
                Text(viewModel.currentAction?.title ?? "")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let subtitle = viewModel.currentAction?.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 12)

            // Approve button (right edge)
            Button(action: { viewModel.approveAction() }) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(.green)
            }
            .buttonStyle(.plain)
            .padding(.trailing, 14)
        }
        .frame(height: 44)
        .frame(maxWidth: .infinity)
        .background(
            Capsule()
                .fill(.black.opacity(0.85))
        )
        .padding(.horizontal, 8)
        .padding(.top, geometry.notchHeight + 4)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
