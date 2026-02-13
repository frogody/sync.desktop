import SwiftUI

/// Compact chat: dark notch-contour bar with colored ring,
/// labels positioned in the visible wings (left and right of notch),
/// and a separate frosted glass chat bubble below.
struct CompactChatView: View {
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
            chatBubble
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

            // Colored ring on outer edge
            NotchRingView(
                geometry: geometry,
                ringWidth: 4,
                glowIntensity: max(viewModel.isStreaming ? 0.8 : 0.4, viewModel.interactionPulse),
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

            // Right wing: status + buttons
            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    Circle()
                        .fill(viewModel.isAuthenticated ? Color.green : Color.red)
                        .frame(width: 6, height: 6)
                    Text(statusText)
                        .font(.system(size: 9))
                        .foregroundColor(.gray)
                }

                Button(action: { viewModel.expandChat() }) {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 10))
                        .foregroundColor(Color(red: 0.85, green: 0.75, blue: 0.45))
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
    }

    // MARK: - Chat Bubble

    private var chatBubble: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 8) {
                        if viewModel.chatMessages.isEmpty {
                            Text("Hey there, how can I help?")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white.opacity(0.85))
                                .padding(.top, 14)
                                .frame(maxWidth: .infinity, alignment: .center)
                        }

                        ForEach(viewModel.chatMessages) { msg in
                            messageBubble(msg)
                                .id(msg.id)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
                .frame(maxHeight: 140)
                .onChange(of: viewModel.chatMessages.count) { _ in
                    if let lastId = viewModel.chatMessages.last?.id {
                        withAnimation { proxy.scrollTo(lastId, anchor: .bottom) }
                    }
                }
            }

            inputField
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
        }
        .frame(width: barWidth - 16)
        .background(
            FrostedGlassView(material: .hudWindow, cornerRadius: 16)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onAppear {
            // Start blinking cursor
            Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
                cursorVisible.toggle()
            }
        }
    }

    // MARK: - Message Bubble

    private func messageBubble(_ msg: ChatMessage) -> some View {
        HStack {
            if msg.role == .user { Spacer(minLength: 50) }

            Text(msg.content)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(msg.role == .user ? 1.0 : 0.9))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    msg.role == .user
                        ? Color.blue.opacity(0.5)
                        : Color.white.opacity(0.08)
                )
                .cornerRadius(12)

            if msg.role == .assistant { Spacer(minLength: 50) }
        }
    }

    // MARK: - Input Field (display-only — keyboard captured globally via CGEventTap)

    private var inputField: some View {
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
                    .scaleEffect(0.7)
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
    }

    // MARK: - Status

    private var statusText: String {
        if viewModel.isStreaming { return "Thinking" }
        if viewModel.isAuthenticated { return "Connected" }
        return "Not connected"
    }

}
