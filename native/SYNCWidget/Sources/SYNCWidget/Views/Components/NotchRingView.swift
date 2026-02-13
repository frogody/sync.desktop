import SwiftUI

/// Elegant single-tone ring that traces the notch bar edge.
/// Uses a soft gradient with subtle glow that pulses with audio level.
struct NotchRingView: View {
    let geometry: NotchGeometry
    var ringWidth: CGFloat = 3
    var glowIntensity: CGFloat = 0.5
    var speed: Double = 1.0

    @State private var phase: CGFloat = 0.0
    @State private var glowPulse: CGFloat = 0.0

    // Refined accent palette — two-tone gradient
    private let accentStart = Color(red: 0.40, green: 0.50, blue: 1.0)   // Soft blue
    private let accentEnd   = Color(red: 0.70, green: 0.40, blue: 1.0)   // Soft violet

    private var edgeShape: NotchEdgeShape {
        NotchEdgeShape(cornerRadius: 14)
    }

    var body: some View {
        ZStack {
            // Soft outer glow
            if glowIntensity > 0.1 {
                edgeShape
                    .stroke(
                        LinearGradient(
                            colors: [
                                accentStart.opacity(0.25 * glowIntensity),
                                accentEnd.opacity(0.20 * glowIntensity),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        ),
                        style: StrokeStyle(
                            lineWidth: ringWidth + 4 + glowPulse * 2,
                            lineCap: .round
                        )
                    )
                    .blur(radius: 3 + glowPulse * 1.5)
                    .allowsHitTesting(false)
            }

            // Main ring — clean gradient stroke
            edgeShape
                .trim(from: 0, to: 1)
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [
                            accentStart.opacity(0.9),
                            accentEnd.opacity(0.7),
                            accentStart.opacity(0.5),
                            accentEnd.opacity(0.9),
                        ]),
                        center: .center,
                        angle: .degrees(phase * 360)
                    ),
                    style: StrokeStyle(lineWidth: ringWidth, lineCap: .round)
                )
        }
        .onAppear {
            guard speed > 0 else { return }
            withAnimation(
                .linear(duration: 6.0 / speed)
                .repeatForever(autoreverses: false)
            ) {
                phase = 1.0
            }
            withAnimation(
                .easeInOut(duration: 2.5 / speed)
                .repeatForever(autoreverses: true)
            ) {
                glowPulse = 1.0
            }
        }
    }
}
