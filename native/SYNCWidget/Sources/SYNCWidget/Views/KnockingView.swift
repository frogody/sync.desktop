import SwiftUI

/// Knocking state: dark notch bar bounces downward 3 times,
/// ring glow pulses brighter with each knock, notification badge appears.
struct KnockingView: View {
    @ObservedObject var viewModel: NotchViewModel
    let geometry: NotchGeometry

    @State private var bounceOffset: CGFloat = 0
    @State private var ringGlow: CGFloat = 0.3
    @State private var showBadge: Bool = false
    @State private var knockCount: Int = 0

    private let barWidth: CGFloat = 440
    private let barCornerRadius: CGFloat = 16

    private var barHeight: CGFloat { geometry.notchHeight + 38 }
    private var labelsY: CGFloat { geometry.notchHeight + (barHeight - geometry.notchHeight) / 2 }

    // Wing positions (visible areas to left/right of notch)
    private var notchLeftX: CGFloat { (barWidth - geometry.notchWidth) / 2 }
    private var notchRightX: CGFloat { (barWidth + geometry.notchWidth) / 2 }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                // Dark background — notch cutout 8pt narrower than physical to close side gaps
                NotchContourShape(
                    notchWidth: geometry.notchWidth - 8,
                    notchHeight: geometry.notchHeight,
                    cornerRadius: barCornerRadius
                )
                .fill(Color.black)

                NotchRingView(
                    geometry: geometry,
                    ringWidth: 4,
                    glowIntensity: ringGlow,
                    speed: 1.5
                )

                // Left wing: SYNC label
                VStack(alignment: .leading, spacing: 1) {
                    Text("SYNC")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                    Text("needs your attention")
                        .font(.system(size: 8))
                        .foregroundColor(.white.opacity(0.8))
                }
                .position(
                    x: (barCornerRadius + notchLeftX) / 2,
                    y: labelsY
                )

                // Right wing: action buttons
                HStack(spacing: 8) {
                    Button(action: { viewModel.activateChat() }) {
                        Text("Open")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.black)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.9))
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)

                    Button(action: { viewModel.dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 10))
                            .foregroundColor(Color(red: 0.85, green: 0.75, blue: 0.45))
                    }
                    .buttonStyle(.plain)
                }
                .position(
                    x: (notchRightX + barWidth - barCornerRadius) / 2,
                    y: labelsY
                )
            }
            .frame(width: barWidth, height: barHeight)

            if showBadge {
                Circle()
                    .fill(Color.red)
                    .frame(width: 10, height: 10)
                    .offset(x: -8, y: geometry.notchHeight + 2)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .offset(y: bounceOffset)
        .frame(maxWidth: .infinity, alignment: .center)
        .onAppear { performKnockSequence() }
    }

    private func performKnockSequence() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { performSingleKnock() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { performSingleKnock() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { performSingleKnock() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                showBadge = true
            }
        }
    }

    private func performSingleKnock() {
        knockCount += 1
        withAnimation(.spring(response: 0.15, dampingFraction: 0.3)) {
            bounceOffset = 8
        }
        withAnimation(.easeIn(duration: 0.1)) {
            ringGlow = 1.0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                bounceOffset = 0
            }
            withAnimation(.easeOut(duration: 0.3)) {
                ringGlow = 0.4
            }
        }
    }
}
