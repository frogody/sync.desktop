import SwiftUI

/// Thinking state: dark notch bar with colored ring glowing intensely,
/// pulsing animation, and "Thinking..." label.
struct ThinkingView: View {
    let geometry: NotchGeometry

    // Layout constants
    private let barWidth: CGFloat = 440
    private let barCornerRadius: CGFloat = 16

    private var barHeight: CGFloat { geometry.notchHeight + 38 }
    private var labelsY: CGFloat { geometry.notchHeight + (barHeight - geometry.notchHeight) / 2 }

    // Wing positions (visible areas to left/right of notch)
    private var notchLeftX: CGFloat { (barWidth - geometry.notchWidth) / 2 }
    private var notchRightX: CGFloat { (barWidth + geometry.notchWidth) / 2 }

    var body: some View {
        ZStack {
            // Dark background — notch cutout 8pt narrower than physical to close side gaps
            NotchContourShape(
                notchWidth: geometry.notchWidth - 8,
                notchHeight: geometry.notchHeight,
                cornerRadius: barCornerRadius
            )
            .fill(Color.black)

            // Ring with fast glow pulse
            NotchRingView(
                geometry: geometry,
                ringWidth: 5,
                glowIntensity: 1.0,
                speed: 3.0
            )

            // Left wing: SYNC label
            VStack(alignment: .leading, spacing: 1) {
                Text("SYNC")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                Text("AI Orchestrator")
                    .font(.system(size: 8))
                    .foregroundColor(.gray)
            }
            .position(
                x: (barCornerRadius + notchLeftX) / 2,
                y: labelsY
            )

            // Right wing: thinking indicator
            HStack(spacing: 4) {
                ProgressView()
                    .controlSize(.mini)
                    .scaleEffect(0.6)
                Text("Thinking...")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.gray)
            }
            .position(
                x: (notchRightX + barWidth - barCornerRadius) / 2,
                y: labelsY
            )
        }
        .frame(width: barWidth, height: barHeight)
        .frame(maxWidth: .infinity, alignment: .center)
    }
}
