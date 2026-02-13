import SwiftUI

/// Premium waveform visualization with tall, smooth bars that pulse with audio.
/// Bars have a gradient fill and soft glow, creating a polished voice UI feel.
struct AudioWaveformView: View {
    let audioLevel: CGFloat       // 0...1 current amplitude
    let barCount: Int
    let color: Color
    let maxBarHeight: CGFloat

    // Backwards compat
    var dotCount: Int { barCount }
    var maxDotSize: CGFloat { maxBarHeight }

    @State private var animatedLevels: [CGFloat] = []

    init(
        audioLevel: CGFloat,
        dotCount: Int = 7,
        color: Color = Color(red: 0.55, green: 0.45, blue: 1.0),
        maxDotSize: CGFloat = 18
    ) {
        self.audioLevel = audioLevel
        self.barCount = dotCount
        self.color = color
        self.maxBarHeight = maxDotSize
    }

    var body: some View {
        HStack(alignment: .center, spacing: 2) {
            ForEach(0..<barCount, id: \.self) { index in
                let height = barHeight(for: index)
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(
                        LinearGradient(
                            colors: [
                                color,
                                color.opacity(0.4),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 3, height: height)
                    .shadow(color: color.opacity(0.35), radius: 3, y: 0)
            }
        }
        .onAppear {
            animatedLevels = Array(repeating: 0.2, count: barCount)
            startAnimating()
        }
        .onChange(of: audioLevel) { newLevel in
            updateLevels(newLevel)
        }
    }

    private func barHeight(for index: Int) -> CGFloat {
        let level = index < animatedLevels.count ? animatedLevels[index] : 0.2
        // Bell curve shape — center bars taller, edges shorter
        let centerIndex = CGFloat(barCount - 1) / 2.0
        let distFromCenter = abs(CGFloat(index) - centerIndex) / max(centerIndex, 1)
        let shapeFactor = 1.0 - distFromCenter * distFromCenter * 0.5
        let height = max(4, level * maxBarHeight * shapeFactor)
        return height
    }

    private func updateLevels(_ level: CGFloat) {
        withAnimation(.easeOut(duration: 0.1)) {
            animatedLevels = (0..<barCount).map { i in
                // Stagger: each bar has a slightly different random variation
                let phase = CGFloat(i) / CGFloat(barCount)
                let variation = CGFloat.random(in: 0.45...1.0)
                let wave = sin(phase * .pi) * 0.2 + 0.8  // Gentle wave modulation
                return max(0.18, level * variation * wave)
            }
        }
    }

    private func startAnimating() {
        Timer.scheduledTimer(withTimeInterval: 0.07, repeats: true) { _ in
            updateLevels(audioLevel)
        }
    }
}
