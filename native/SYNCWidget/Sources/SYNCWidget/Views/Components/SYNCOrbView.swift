import SwiftUI

/// The SYNC avatar orb with rainbow segmented ring.
/// Large, premium design with thick segments, visible gaps,
/// camera lens depth center, and refined glow.
struct SYNCOrbView: View {
    var size: CGFloat = 64
    var ringWidth: CGFloat = 5
    var isAnimating: Bool = true
    var rotationSpeed: Double = 1.0
    var glowIntensity: CGFloat = 0.5

    @State private var rotation: Double = 0

    // Agent segments matching SyncAvatarMini.tsx AGENT_SEGMENTS
    private static let segments: [(color: Color, from: Double, to: Double)] = [
        (Color(red: 0.93, green: 0.28, blue: 0.60), 0.0, 0.1),   // pink
        (Color(red: 0.02, green: 0.71, blue: 0.83), 0.1, 0.2),   // cyan
        (Color(red: 0.39, green: 0.40, blue: 0.95), 0.2, 0.3),   // indigo
        (Color(red: 0.06, green: 0.73, blue: 0.51), 0.3, 0.4),   // emerald
        (Color(red: 0.53, green: 0.94, blue: 0.67), 0.4, 0.5),   // sage
        (Color(red: 0.96, green: 0.62, blue: 0.04), 0.5, 0.6),   // amber
        (Color(red: 0.96, green: 0.25, blue: 0.37), 0.6, 0.7),   // rose
        (Color(red: 0.98, green: 0.45, blue: 0.09), 0.7, 0.8),   // orange
        (Color(red: 0.23, green: 0.51, blue: 0.96), 0.8, 0.9),   // blue
        (Color(red: 0.08, green: 0.72, blue: 0.65), 0.9, 1.0),   // teal
    ]

    var body: some View {
        ZStack {
            // Camera lens depth - layered radial gradients
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(white: 0.14),
                            Color(white: 0.07),
                            Color.black,
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: (size - ringWidth * 2) / 2
                    )
                )
                .frame(width: size - ringWidth * 2, height: size - ringWidth * 2)

            // Subtle lens reflection highlight (top-left)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.06),
                            Color.clear,
                        ],
                        center: UnitPoint(x: 0.35, y: 0.35),
                        startRadius: 0,
                        endRadius: (size - ringWidth * 2) / 3
                    )
                )
                .frame(width: size - ringWidth * 2, height: size - ringWidth * 2)

            // Rainbow segmented ring with distinct gaps
            ForEach(Array(Self.segments.enumerated()), id: \.offset) { _, segment in
                Circle()
                    .trim(from: segment.from + 0.012, to: segment.to - 0.012)
                    .stroke(
                        segment.color,
                        style: StrokeStyle(lineWidth: ringWidth, lineCap: .round)
                    )
                    .frame(width: size - ringWidth, height: size - ringWidth)
            }
            .rotationEffect(.degrees(rotation))

            // Outer glow
            if glowIntensity > 0 {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color.purple.opacity(0.2 * glowIntensity),
                                Color.cyan.opacity(0.08 * glowIntensity),
                                Color.clear,
                            ],
                            center: .center,
                            startRadius: size / 2,
                            endRadius: size / 2 + 14
                        )
                    )
                    .frame(width: size + 28, height: size + 28)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: size + 28, height: size + 28)
        .onAppear {
            if isAnimating { startRotation() }
        }
        .onChange(of: isAnimating) { animating in
            if animating { startRotation() }
        }
        .onChange(of: rotationSpeed) { _ in
            if isAnimating { startRotation() }
        }
    }

    private func startRotation() {
        withAnimation(
            .linear(duration: 20.0 / rotationSpeed)
            .repeatForever(autoreverses: false)
        ) {
            rotation = 360
        }
    }
}
