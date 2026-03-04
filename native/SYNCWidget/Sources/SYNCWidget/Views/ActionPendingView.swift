import SwiftUI

/// Dark pill notification extending from the notch area.
/// Shows action title with approve (checkmark) and dismiss (x) buttons.
/// Adapts UI for task_create actions with a task icon and "Add Task" label.
struct ActionPendingView: View {
    @ObservedObject var viewModel: NotchViewModel
    let geometry: NotchGeometry

    private var isTaskAction: Bool {
        viewModel.currentAction?.actionType == "task_create"
    }

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

            // Action icon + text (centered)
            HStack(spacing: 8) {
                if isTaskAction {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(.cyan)
                }

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
            }

            Spacer(minLength: 12)

            // Approve button (right edge)
            Button(action: { viewModel.approveAction() }) {
                if isTaskAction {
                    HStack(spacing: 4) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 18, weight: .medium))
                        Text("Add Task")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(.cyan)
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(.green)
                }
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
