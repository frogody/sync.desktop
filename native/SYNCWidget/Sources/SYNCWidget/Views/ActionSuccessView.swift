import SwiftUI

/// Premium success confirmation pill. Checkmark bounces in with a ripple ring,
/// then fades out gracefully before ViewModel transitions back to idle.
struct ActionSuccessView: View {
    let geometry: NotchGeometry

    @State private var checkScale: CGFloat = 0.5
    @State private var checkOpacity: Double = 0
    @State private var ringScale: CGFloat = 0.5
    @State private var ringOpacity: Double = 0.7
    @State private var labelOpacity: Double = 0

    private let successColor = Color(red: 0.10, green: 0.78, blue: 0.52)

    var body: some View {
        HStack(spacing: 9) {
            Spacer()

            // Checkmark with expanding ripple ring
            ZStack {
                Circle()
                    .stroke(successColor.opacity(ringOpacity), lineWidth: 1.0)
                    .frame(width: 26, height: 26)
                    .scaleEffect(ringScale)

                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(successColor)
                    .scaleEffect(checkScale)
            }
            .opacity(checkOpacity)

            Text("Done")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(successColor)
                .opacity(labelOpacity)

            Spacer()
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
        .shadow(color: successColor.opacity(0.12), radius: 12, x: 0, y: 4)
        .padding(.horizontal, 8)
        .padding(.top, geometry.notchHeight + 4)
        .onAppear {
            // Bounce in checkmark
            withAnimation(.spring(response: 0.38, dampingFraction: 0.62)) {
                checkScale = 1.0
                checkOpacity = 1.0
            }
            // Ripple ring expands and evaporates
            withAnimation(.easeOut(duration: 0.55).delay(0.08)) {
                ringScale = 1.8
                ringOpacity = 0
            }
            // Label fades in slightly after
            withAnimation(.easeOut(duration: 0.25).delay(0.15)) {
                labelOpacity = 1.0
            }
            // Everything fades out near end of 1.5s window
            withAnimation(.easeInOut(duration: 0.38).delay(1.0)) {
                checkOpacity = 0
                labelOpacity = 0
            }
        }
        .transition(.asymmetric(
            insertion: .move(edge: .top)
                .combined(with: .opacity)
                .combined(with: .scale(scale: 0.90, anchor: .top)),
            removal: .move(edge: .top)
                .combined(with: .opacity)
        ))
    }
}
