import SwiftUI

/// Brief green checkmark animation shown after action approval.
/// Auto-transitions to idle after 1.5 seconds (handled by ViewModel).
struct ActionSuccessView: View {
    let geometry: NotchGeometry

    @State private var scale: CGFloat = 0.5
    @State private var opacity: Double = 0

    var body: some View {
        HStack {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 28, weight: .medium))
                .foregroundStyle(.green)
                .scaleEffect(scale)
                .opacity(opacity)
            Spacer()
        }
        .frame(height: 44)
        .frame(maxWidth: .infinity)
        .background(
            Capsule()
                .fill(.black.opacity(0.85))
        )
        .padding(.horizontal, 8)
        .padding(.top, geometry.notchHeight + 4)
        .onAppear {
            withAnimation(.spring(duration: 0.4, bounce: 0.3)) {
                scale = 1.0
                opacity = 1.0
            }
            // Fade out near the end of the 1.5s display window
            withAnimation(.easeOut(duration: 0.4).delay(1.0)) {
                opacity = 0.3
            }
        }
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
