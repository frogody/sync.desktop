import SwiftUI

/// Hovering state: Rainbow ring segments peek from the notch edges.
/// The glow intensity scales with mouse proximity (0 at zone edge, 1 at notch).
struct HoverGlowView: View {
    let geometry: NotchGeometry
    var intensity: CGFloat  // 0-1

    // Agent colors matching SYNC orb segments
    private let segmentColors: [Color] = [
        Color(red: 0.93, green: 0.28, blue: 0.60), // pink
        Color(red: 0.02, green: 0.71, blue: 0.83), // cyan
        Color(red: 0.39, green: 0.40, blue: 0.95), // indigo
        Color(red: 0.06, green: 0.73, blue: 0.51), // emerald
        Color(red: 0.53, green: 0.94, blue: 0.67), // sage
        Color(red: 0.96, green: 0.62, blue: 0.04), // amber
        Color(red: 0.96, green: 0.25, blue: 0.37), // rose
        Color(red: 0.98, green: 0.45, blue: 0.09), // orange
        Color(red: 0.23, green: 0.51, blue: 0.96), // blue
        Color(red: 0.08, green: 0.72, blue: 0.65), // teal
    ]

    @State private var shimmer: CGFloat = 0

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                // Colored dots peeking from notch bottom edge
                // Simulates the orb living behind the notch
                ForEach(0..<segmentColors.count, id: \.self) { i in
                    let angle = (Double(i) / Double(segmentColors.count)) * .pi * 2
                    let peekAmount = 4.0 + intensity * 10.0
                    let centerX = proxy.size.width / 2
                    let orbRadius = min(geometry.notchWidth / 2 - 20, 28.0)

                    Circle()
                        .fill(segmentColors[i])
                        .frame(width: 5 + intensity * 5, height: 5 + intensity * 5)
                        .shadow(color: segmentColors[i].opacity(0.6), radius: 3)
                        .offset(
                            x: cos(angle + shimmer) * orbRadius,
                            y: sin(angle + shimmer) * orbRadius * 0.3 + peekAmount
                        )
                        .opacity(Double(intensity) * (sin(angle + shimmer * 2) * 0.3 + 0.7))
                        .position(x: centerX, y: geometry.notchHeight * 0.8)
                }

                // Soft rainbow glow underneath the notch
                Ellipse()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color.purple.opacity(0.35 * Double(intensity)),
                                Color.cyan.opacity(0.15 * Double(intensity)),
                                Color.clear,
                            ],
                            center: .center,
                            startRadius: 0,
                            endRadius: geometry.notchWidth / 2
                        )
                    )
                    .frame(
                        width: geometry.notchWidth + intensity * 40,
                        height: 16 + intensity * 24
                    )
                    .position(x: proxy.size.width / 2, y: geometry.notchHeight + 6)
                    .blur(radius: 5)
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 4).repeatForever(autoreverses: false)) {
                shimmer = .pi * 2
            }
        }
    }
}
