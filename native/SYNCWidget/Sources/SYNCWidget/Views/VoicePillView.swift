import SwiftUI

/// Premium voice mode pill extending from the notch.
/// Features audio-reactive ambient glow, expressive waveform bars,
/// and smooth state transitions for a polished voice UI.
struct VoicePillView: View {
    @ObservedObject var viewModel: NotchViewModel
    let geometry: NotchGeometry

    @StateObject private var speechRecognizer = SpeechRecognizer()
    private let voiceClient = VoiceClient()

    @State private var hasRequestedPermissions = false
    @State private var isProcessing = false
    @State private var lastTranscriptChange: Date = Date()
    @State private var silenceTimer: Timer?
    @State private var breathe: CGFloat = 0  // Subtle idle breathing animation

    // Layout — same width for both states (no resize jump)
    private let barWidth: CGFloat = 320
    private let barCornerRadius: CGFloat = 14

    private var barHeight: CGFloat { geometry.notchHeight + 30 }
    private var labelsY: CGFloat { geometry.notchHeight + (barHeight - geometry.notchHeight) / 2 }

    private var notchLeftX: CGFloat { (barWidth - geometry.notchWidth) / 2 }
    private var notchRightX: CGFloat { (barWidth + geometry.notchWidth) / 2 }

    // Accent palette
    private let accentBlue = Color(red: 0.40, green: 0.50, blue: 1.0)
    private let accentViolet = Color(red: 0.65, green: 0.35, blue: 1.0)
    private let accentCyan = Color(red: 0.30, green: 0.75, blue: 1.0)

    var body: some View {
        VStack(spacing: 6) {
            if viewModel.state == .voiceSpeaking {
                speakingBar
                    .transition(.opacity.combined(with: .scale(scale: 0.97)))
            } else {
                listeningBar
                    .transition(.opacity.combined(with: .scale(scale: 0.97)))
            }

            if !displayText.isEmpty {
                transcriptBubble
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.82), value: viewModel.state)
        .frame(maxWidth: .infinity, alignment: .center)
        .onAppear {
            startVoiceSession()
            // Idle breathing animation
            withAnimation(.easeInOut(duration: 3.0).repeatForever(autoreverses: true)) {
                breathe = 1.0
            }
        }
        .onDisappear { cleanup() }
        .onChange(of: speechRecognizer.transcript) { newValue in
            if !newValue.isEmpty {
                lastTranscriptChange = Date()
            }
        }
    }

    // MARK: - Listening Bar

    private var listeningBar: some View {
        let currentAudio = speechRecognizer.audioLevel
        return ZStack {
            // Base shape
            NotchContourShape(
                notchWidth: geometry.notchWidth - 8,
                notchHeight: geometry.notchHeight,
                cornerRadius: barCornerRadius
            )
            .fill(Color.black)

            // Inner ambient glow — breathes when idle, pulses with audio when speaking
            NotchContourShape(
                notchWidth: geometry.notchWidth - 8,
                notchHeight: geometry.notchHeight,
                cornerRadius: barCornerRadius
            )
            .fill(
                RadialGradient(
                    colors: [
                        accentViolet.opacity(0.06 + breathe * 0.03 + currentAudio * 0.08),
                        Color.clear,
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: 120
                )
            )

            // Ring
            NotchRingView(
                geometry: geometry,
                ringWidth: 2.5,
                glowIntensity: 0.2 + currentAudio * 0.5,
                speed: 1.5
            )

            // Left wing: SYNC label with subtle waveform (shows mic activity)
            HStack(spacing: 8) {
                Text("SYNC")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.9))

                // Mini waveform showing mic input level
                AudioWaveformView(
                    audioLevel: currentAudio,
                    dotCount: 5,
                    color: accentViolet.opacity(0.7),
                    maxDotSize: 10
                )
                .scaleEffect(x: -1, y: 1)
            }
            .position(
                x: (barCornerRadius + notchLeftX) / 2,
                y: labelsY
            )

            // Right wing: status
            HStack(spacing: 4) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 5, height: 5)
                    .shadow(color: statusColor.opacity(0.5), radius: 3)
                Text(voiceStatusText)
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }
            .position(
                x: (notchRightX + barWidth - barCornerRadius) / 2,
                y: labelsY
            )
        }
        .frame(width: barWidth, height: barHeight)
    }

    // MARK: - Speaking Bar

    private var speakingBar: some View {
        let audio = viewModel.audioLevel
        return ZStack {
            // Base shape
            NotchContourShape(
                notchWidth: geometry.notchWidth - 8,
                notchHeight: geometry.notchHeight,
                cornerRadius: barCornerRadius
            )
            .fill(Color.black)

            // Audio-reactive inner ambient glow
            NotchContourShape(
                notchWidth: geometry.notchWidth - 8,
                notchHeight: geometry.notchHeight,
                cornerRadius: barCornerRadius
            )
            .fill(
                RadialGradient(
                    colors: [
                        accentBlue.opacity(0.08 + audio * 0.12),
                        accentViolet.opacity(0.04 + audio * 0.06),
                        Color.clear,
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: 150
                )
            )

            // Ring — more intense during speaking
            NotchRingView(
                geometry: geometry,
                ringWidth: 3,
                glowIntensity: 0.35 + audio * 0.5,
                speed: 2.0
            )

            // Left wing: label + expressive waveform
            HStack(spacing: 6) {
                Text("SYNC")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.9))

                AudioWaveformView(
                    audioLevel: audio,
                    dotCount: 7,
                    color: accentViolet,
                    maxDotSize: 16
                )
                .scaleEffect(x: -1, y: 1)
            }
            .position(
                x: (barCornerRadius + notchLeftX) / 2,
                y: labelsY
            )

            // Right wing: waveform + pulsing indicator
            HStack(spacing: 6) {
                AudioWaveformView(
                    audioLevel: audio,
                    dotCount: 7,
                    color: accentBlue,
                    maxDotSize: 16
                )

                // Pulsing speaking indicator
                ZStack {
                    Circle()
                        .fill(accentCyan.opacity(0.2 + audio * 0.3))
                        .frame(width: 10, height: 10)
                        .blur(radius: 2)
                    Circle()
                        .fill(accentCyan)
                        .frame(width: 5, height: 5)
                }
            }
            .position(
                x: (notchRightX + barWidth - barCornerRadius) / 2,
                y: labelsY
            )
        }
        .frame(width: barWidth, height: barHeight)
    }

    // MARK: - Transcript Bubble

    private var transcriptBubble: some View {
        Text(displayText)
            .font(.system(size: 11, weight: .regular, design: .rounded))
            .foregroundColor(.white.opacity(0.88))
            .lineLimit(3)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                ZStack {
                    FrostedGlassView(material: .hudWindow, cornerRadius: 10)
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.white.opacity(0.05))
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(
                            LinearGradient(
                                colors: [
                                    Color.white.opacity(0.1),
                                    Color.white.opacity(0.03),
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                            lineWidth: 0.5
                        )
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .transition(.opacity.combined(with: .move(edge: .top)))
    }

    // MARK: - Computed Properties

    private var statusColor: Color {
        if !viewModel.isAuthenticated { return Color(red: 1.0, green: 0.35, blue: 0.35) }
        if speechRecognizer.isListening { return Color(red: 0.35, green: 0.90, blue: 0.55) }
        return Color.white.opacity(0.4)
    }

    private var voiceStatusText: String {
        if !viewModel.isAuthenticated { return "Not connected" }
        if speechRecognizer.isListening { return "Listening" }
        return "Starting..."
    }

    private var displayText: String {
        if viewModel.state == .voiceListening {
            return speechRecognizer.transcript.isEmpty
                ? (speechRecognizer.error ?? "")
                : speechRecognizer.transcript
        } else {
            return viewModel.voiceTranscript
        }
    }

    // MARK: - Voice Session

    private func startVoiceSession() {
        guard !hasRequestedPermissions else { return }
        hasRequestedPermissions = true

        Task {
            let authorized = await speechRecognizer.requestPermissions()
            guard authorized else { return }
            speechRecognizer.startListening()
            startSilenceDetection()
        }
    }

    private func startSilenceDetection() {
        silenceTimer?.invalidate()
        lastTranscriptChange = Date()
        isProcessing = false

        let timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
            Task { @MainActor in
                checkSilence()
            }
        }
        silenceTimer = timer
    }

    private func checkSilence() {
        guard viewModel.state == .voiceListening,
              speechRecognizer.isListening,
              !speechRecognizer.transcript.isEmpty,
              !isProcessing else { return }

        let elapsed = Date().timeIntervalSince(lastTranscriptChange)
        if elapsed >= 1.8 {
            let text = speechRecognizer.transcript
            fputs("[voice] silence detected, transcript: \"\(text.prefix(60))\"\n", stderr)
            isProcessing = true
            silenceTimer?.invalidate()
            silenceTimer = nil
            speechRecognizer.stopListening()
            processTranscript(text)
        }
    }

    private func processTranscript(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            fputs("[voice] empty transcript, restarting\n", stderr)
            isProcessing = false
            startSilenceDetection()
            speechRecognizer.startListening()
            return
        }
        guard let config = viewModel.config else {
            fputs("[voice] no config! user not authenticated\n", stderr)
            viewModel.voiceTranscript = "Not connected — sign in first"
            isProcessing = false
            return
        }

        fputs("[voice] sending transcript to API: \"\(text.prefix(60))\"\n", stderr)
        viewModel.voiceTranscript = ""
        viewModel.transition(to: .voiceSpeaking)

        Task {
            await voiceClient.sendVoice(
                message: text,
                config: config,
                context: viewModel.context,
                onResponse: { responseText in
                    Task { @MainActor in
                        viewModel.voiceTranscript = responseText
                    }
                },
                onAudioStart: {
                    Task { @MainActor in
                        viewModel.audioLevel = 0.5
                    }
                },
                onAudioEnd: {
                    Task { @MainActor in
                        viewModel.audioLevel = 0
                        viewModel.transition(to: .voiceListening)
                        isProcessing = false
                        speechRecognizer.startListening()
                        startSilenceDetection()
                    }
                },
                onError: { error in
                    Task { @MainActor in
                        viewModel.voiceTranscript = "Error: \(error)"
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        viewModel.transition(to: .voiceListening)
                        isProcessing = false
                        speechRecognizer.startListening()
                        startSilenceDetection()
                    }
                }
            )
        }
    }

    private func cleanup() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        speechRecognizer.stopListening()
        voiceClient.stopAudio()
    }
}
