import AppKit
import SwiftUI
import Combine
import ApplicationServices

/// A transparent, non-activating overlay panel positioned at the notch.
/// Uses NSPanel to float above all windows without stealing focus.
/// Dynamically resizes to match content height so transparent areas don't block clicks.
final class NotchOverlayPanel: NSPanel {
    private let geometry: NotchGeometry
    private let viewModel: NotchViewModel
    private var cancellables = Set<AnyCancellable>()
    private var clickOutsideMonitor: Any?

    private let topBleed: CGFloat = 4  // Extends above screen to overlap with physical notch

    init(geometry: NotchGeometry, viewModel: NotchViewModel) {
        self.geometry = geometry
        self.viewModel = viewModel

        let screen = geometry.screenFrame
        // Start as 1x1 -- idle state blocks nothing
        let initialFrame = NSRect(
            x: screen.origin.x + (screen.width - 1) / 2,
            y: screen.origin.y + screen.height - 1,
            width: 1,
            height: 1
        )

        super.init(
            contentRect: initialFrame,
            styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        configure()
        installContentView()
        observeStateChanges()
    }

    private func configure() {
        level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1)

        isMovable = false
        isMovableByWindowBackground = false

        isOpaque = false
        backgroundColor = .clear
        hasShadow = false

        collectionBehavior = [
            .canJoinAllSpaces,
            .fullScreenAuxiliary,
            .stationary,
            .ignoresCycle
        ]

        ignoresMouseEvents = false  // Accept click events for action buttons
        hidesOnDeactivate = false   // Stay visible even when app deactivates
        isReleasedWhenClosed = false
    }

    private func installContentView() {
        let rootView = NotchContainerView(viewModel: viewModel, geometry: geometry)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .ignoresSafeArea()

        let hostingView = SafeAreaIgnoringHostingView(rootView: rootView)
        hostingView.frame = contentView?.bounds ?? .zero
        hostingView.autoresizingMask = [.width, .height]

        contentView = hostingView
    }

    private func observeStateChanges() {
        viewModel.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newState in
                guard let self = self else { return }

                switch newState {
                case .idle:
                    self.ignoresMouseEvents = true
                    self.removeClickOutsideMonitor()
                case .actionPending, .actionSuccess:
                    self.ignoresMouseEvents = false
                    self.installClickOutsideMonitor()
                }

                // Resize panel to fit content
                self.resizeForState(newState)
            }
            .store(in: &cancellables)
    }

    // MARK: - Dynamic Panel Sizing

    private func resizeForState(_ state: WidgetState) {
        let contentHeight: CGFloat
        let width: CGFloat

        switch state {
        case .idle:
            // Tiny 1x1 frame -- effectively invisible, blocks nothing
            contentHeight = 1
            width = 1
        case .actionPending:
            // Pill: notch height + pill (44px) + padding
            contentHeight = geometry.notchHeight + 4 + 44 + 8
            width = 500
        case .actionSuccess:
            // Same size as actionPending for smooth transition
            contentHeight = geometry.notchHeight + 4 + 44 + 8
            width = 500
        }

        let screen = geometry.screenFrame
        let newFrame = NSRect(
            x: screen.origin.x + (screen.width - width) / 2,
            y: screen.origin.y + screen.height - contentHeight + topBleed,
            width: width,
            height: contentHeight
        )

        setFrame(newFrame, display: true, animate: false)
    }

    // MARK: - Click Outside to Dismiss

    private func installClickOutsideMonitor() {
        guard clickOutsideMonitor == nil else { return }
        guard AXIsProcessTrusted() else { return }

        clickOutsideMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            guard let self = self else { return }

            let clickLocation = NSEvent.mouseLocation

            if !self.frame.contains(clickLocation) {
                Task { @MainActor in
                    guard self.viewModel.state == .actionPending else { return }
                    self.viewModel.dismissAction()
                }
            }
        }
    }

    private func removeClickOutsideMonitor() {
        if let monitor = clickOutsideMonitor {
            NSEvent.removeMonitor(monitor)
            clickOutsideMonitor = nil
        }
    }

    deinit {
        removeClickOutsideMonitor()
    }

    // MARK: - Mouse Event Handling

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

// MARK: - Safe Area Override

/// NSHostingView subclass that zeroes out safe area insets so SwiftUI content
/// extends all the way to the screen edge, behind the physical notch.
final class SafeAreaIgnoringHostingView<Content: View>: NSHostingView<Content> {
    override var safeAreaInsets: NSEdgeInsets {
        return NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
    }
}
