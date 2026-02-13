import SwiftUI

/// Expanded chat: dark notch-contour bar with colored ring tracing the notch edge,
/// plus a larger frosted glass chat panel below with full message history.
struct ExpandedChatView: View {
    @ObservedObject var viewModel: NotchViewModel
    let geometry: NotchGeometry

    // Blinking cursor animation
    @State private var cursorVisible = true

    // Layout — bar wider than notch for comfortable wing space
    private let barWidth: CGFloat = 440
    private let barCornerRadius: CGFloat = 16

    private var barHeight: CGFloat { geometry.notchHeight + 38 }
    private var labelsY: CGFloat { geometry.notchHeight + (barHeight - geometry.notchHeight) / 2 }

    // Wing positions (visible areas to left/right of notch)
    private var notchLeftX: CGFloat { (barWidth - geometry.notchWidth) / 2 }
    private var notchRightX: CGFloat { (barWidth + geometry.notchWidth) / 2 }

    var body: some View {
        VStack(spacing: 8) {
            notchBar
            chatPanel
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }

    // MARK: - Notch Bar

    private var notchBar: some View {
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
                glowIntensity: viewModel.isStreaming ? 0.8 : 0.4,
                speed: viewModel.isStreaming ? 2.5 : 1.0
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

            // Right wing: status
            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    Circle()
                        .fill(viewModel.isAuthenticated ? Color.green : Color.red)
                        .frame(width: 6, height: 6)
                    Text(statusText)
                        .font(.system(size: 9))
                        .foregroundColor(.gray)
                }
            }
            .position(
                x: (notchRightX + barWidth - barCornerRadius) / 2,
                y: labelsY
            )
        }
        .frame(width: barWidth, height: barHeight)
    }

    // MARK: - Chat Panel

    private var chatPanel: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(spacing: 0) {
                        if viewModel.chatMessages.isEmpty {
                            orbGreeting
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(viewModel.chatMessages) { msg in
                                messageBubble(msg)
                                    .id(msg.id)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                }
                .onChange(of: viewModel.chatMessages.count) { _ in
                    if let lastId = viewModel.chatMessages.last?.id {
                        withAnimation { proxy.scrollTo(lastId, anchor: .bottom) }
                    }
                }
            }

            inputBar
        }
        .frame(width: barWidth - 16, height: 340)
        .background(
            FrostedGlassView(material: .hudWindow, cornerRadius: 16)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
                cursorVisible.toggle()
            }
        }
    }

    // MARK: - Orb Greeting

    private var orbGreeting: some View {
        VStack(spacing: 14) {
            SYNCOrbView(
                size: 48,
                ringWidth: 4,
                rotationSpeed: 1.0,
                glowIntensity: 0.5
            )

            Text("Hey there, how can I help?")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white.opacity(0.85))
        }
        .padding(.top, 24)
        .padding(.bottom, 16)
    }

    // MARK: - Message Bubble

    private func messageBubble(_ msg: ChatMessage) -> some View {
        HStack {
            if msg.role == .user { Spacer(minLength: 60) }

            Text(msg.content)
                .font(.system(size: 12))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    msg.role == .user
                        ? Color.blue.opacity(0.5)
                        : Color.white.opacity(0.08)
                )
                .cornerRadius(12)
                .textSelection(.enabled)

            if msg.role == .assistant { Spacer(minLength: 60) }
        }
    }

    // MARK: - Input Bar (display-only — keyboard captured globally via CGEventTap)

    private var inputBar: some View {
        HStack(spacing: 8) {
            Group {
                if viewModel.chatInput.isEmpty {
                    Text("Just start typing...")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.3))
                } else {
                    Text(viewModel.chatInput + (cursorVisible ? "|" : " "))
                        .font(.system(size: 12))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .truncationMode(.head)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if viewModel.isStreaming {
                ProgressView()
                    .controlSize(.small)
                    .scaleEffect(0.8)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            FrostedGlassView(material: .hudWindow, cornerRadius: 12)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
    }

    // MARK: - Status

    private var statusText: String {
        if viewModel.isStreaming { return "Thinking" }
        if viewModel.isAuthenticated { return "Connected" }
        return "Not connected"
    }
}
