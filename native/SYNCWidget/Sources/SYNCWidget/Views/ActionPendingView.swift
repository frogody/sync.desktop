import SwiftUI

/// Premium dark glass pill notification extending from the notch.
/// Color-coded by action type. Approve button is a labeled capsule.
/// Dismiss is a minimal × with hover state. Transitions with spring + scale.
struct ActionPendingView: View {
    @ObservedObject var viewModel: NotchViewModel
    let geometry: NotchGeometry

    @State private var approvePressed = false
    @State private var dismissHovered = false

    // MARK: - Action Type Config

    private struct ActionConfig {
        let color: Color
        let label: String
        let icon: String
    }

    private var actionConfig: ActionConfig {
        switch viewModel.currentAction?.actionType {
        case "calendar_event":
            return ActionConfig(
                color: Color(red: 0.22, green: 0.46, blue: 0.96),
                label: "Schedule",
                icon: "calendar.badge.plus"
            )
        case "email_reply":
            return ActionConfig(
                color: Color(red: 0.52, green: 0.31, blue: 0.90),
                label: "Reply",
                icon: "envelope.fill"
            )
        case "task_create":
            return ActionConfig(
                color: Color(red: 0.04, green: 0.75, blue: 0.62),
                label: "Add Task",
                icon: "checkmark.circle.fill"
            )
        case "reminder":
            return ActionConfig(
                color: Color(red: 0.93, green: 0.60, blue: 0.06),
                label: "Remind Me",
                icon: "bell.fill"
            )
        default:
            return ActionConfig(
                color: Color(red: 0.10, green: 0.78, blue: 0.52),
                label: "Approve",
                icon: "checkmark.circle.fill"
            )
        }
    }

    // MARK: - Body

    var body: some View {
        HStack(spacing: 0) {

            // ── Dismiss ───────────────────────────────────────────────────
            Button(action: { viewModel.dismissAction() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white.opacity(dismissHovered ? 0.60 : 0.24))
                    .frame(width: 36, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 8)
            .onHover { hovering in
                withAnimation(.easeInOut(duration: 0.12)) {
                    dismissHovered = hovering
                }
            }

            Spacer(minLength: 6)

            // ── Type dot + title + subtitle ───────────────────────────────
            HStack(spacing: 9) {
                // Action-type color dot with soft glow
                Circle()
                    .fill(actionConfig.color)
                    .frame(width: 5, height: 5)
                    .shadow(color: actionConfig.color.opacity(0.90), radius: 4, x: 0, y: 0)

                VStack(alignment: .leading, spacing: 1.5) {
                    Text(viewModel.currentAction?.title ?? "")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(1)

                    if let subtitle = viewModel.currentAction?.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 11, weight: .regular, design: .rounded))
                            .foregroundStyle(.white.opacity(0.40))
                            .lineLimit(1)
                    }
                }
            }

            Spacer(minLength: 6)

            // ── Approve capsule button ────────────────────────────────────
            Button(action: {
                withAnimation(.spring(response: 0.18, dampingFraction: 0.6)) {
                    approvePressed = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                    withAnimation(.spring(response: 0.22, dampingFraction: 0.7)) {
                        approvePressed = false
                    }
                    viewModel.approveAction()
                }
            }) {
                HStack(spacing: 5) {
                    Image(systemName: actionConfig.icon)
                        .font(.system(size: 11, weight: .semibold))
                    Text(actionConfig.label)
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(actionConfig.color)
                        .overlay(
                            Capsule()
                                .stroke(.white.opacity(0.20), lineWidth: 0.5)
                        )
                )
            }
            .buttonStyle(.plain)
            .scaleEffect(approvePressed ? 0.93 : 1.0)
            .padding(.trailing, 12)
        }
        .frame(height: 52)
        .frame(maxWidth: .infinity)
        .background(
            Capsule()
                .fill(.black.opacity(0.94))
                .overlay(
                    Capsule()
                        .stroke(.white.opacity(0.09), lineWidth: 0.5)
                )
        )
        .shadow(color: .black.opacity(0.45), radius: 18, x: 0, y: 8)
        .shadow(color: actionConfig.color.opacity(0.08), radius: 12, x: 0, y: 4)
        .padding(.horizontal, 8)
        .padding(.top, geometry.notchHeight + 4)
        .transition(.asymmetric(
            insertion: .move(edge: .top)
                .combined(with: .opacity)
                .combined(with: .scale(scale: 0.90, anchor: .top)),
            removal: .move(edge: .top)
                .combined(with: .opacity)
        ))
    }
}
