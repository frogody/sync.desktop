import AppKit
import Combine
import QuartzCore

/// Manages 4 thin edge windows that together form a colored border around the screen.
/// Each window is only a few pixels wide, positioned flush against a screen edge.
///
/// Per-state visual treatment:
/// - idle:           hidden
/// - actionPending:  subtle amber glow
/// - actionSuccess:  brief green pulse
@MainActor
final class ContextBorderManager {
    private let viewModel: NotchViewModel
    private var cancellables = Set<AnyCancellable>()

    private var topWindow: BorderEdgeWindow?
    private var bottomWindow: BorderEdgeWindow?
    private var leftWindow: BorderEdgeWindow?
    private var rightWindow: BorderEdgeWindow?

    private var allWindows: [BorderEdgeWindow] {
        [topWindow, bottomWindow, leftWindow, rightWindow].compactMap { $0 }
    }

    // MARK: - Color palettes

    private let actionPendingColors: [CGColor] = [
        CGColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1),
        CGColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 1),
        CGColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1),
        CGColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 1),
        CGColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1),
    ]

    private let actionSuccessColors: [CGColor] = [
        CGColor(red: 0.06, green: 0.73, blue: 0.51, alpha: 1),
        CGColor(red: 0.53, green: 0.94, blue: 0.67, alpha: 1),
        CGColor(red: 0.06, green: 0.73, blue: 0.51, alpha: 1),
        CGColor(red: 0.53, green: 0.94, blue: 0.67, alpha: 1),
        CGColor(red: 0.06, green: 0.73, blue: 0.51, alpha: 1),
    ]

    // MARK: - Init

    init(viewModel: NotchViewModel) {
        self.viewModel = viewModel

        guard let screen = NSScreen.main else { return }
        let f = screen.frame
        let maxThickness: CGFloat = 8

        topWindow    = BorderEdgeWindow(frame: NSRect(x: f.minX, y: f.maxY - maxThickness, width: f.width, height: maxThickness), edge: .top)
        bottomWindow = BorderEdgeWindow(frame: NSRect(x: f.minX, y: f.minY, width: f.width, height: maxThickness), edge: .bottom)
        leftWindow   = BorderEdgeWindow(frame: NSRect(x: f.minX, y: f.minY, width: maxThickness, height: f.height), edge: .left)
        rightWindow  = BorderEdgeWindow(frame: NSRect(x: f.maxX - maxThickness, y: f.minY, width: maxThickness, height: f.height), edge: .right)

        for w in allWindows {
            w.orderFrontRegardless()
        }

        observeState()
    }

    func close() {
        for w in allWindows { w.close() }
    }

    // MARK: - State Observation

    private func observeState() {
        viewModel.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.updateForState(state)
            }
            .store(in: &cancellables)
    }

    // MARK: - Per-State Updates

    private func updateForState(_ state: WidgetState) {
        let thickness = thicknessFor(state)
        let colors = colorsFor(state)
        let speed = rotationDurationFor(state)
        let opacity = opacityFor(state)

        // Show/hide based on state
        let visible = state != .idle
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = visible ? 0.6 : 0.4
            for w in allWindows {
                w.animator().alphaValue = visible ? 1.0 : 0.0
            }
        }

        for w in allWindows {
            w.updateBorder(
                thickness: thickness,
                colors: colors,
                rotationDuration: speed,
                opacity: opacity,
                isKnocking: false,
                isVoice: false,
                voicePulseDuration: 0
            )
        }
    }

    // MARK: - State Config

    private func thicknessFor(_ state: WidgetState) -> CGFloat {
        switch state {
        case .idle:            return 0
        case .actionPending:   return 2
        case .actionSuccess:   return 3
        }
    }

    private func opacityFor(_ state: WidgetState) -> Float {
        switch state {
        case .idle:            return 0
        case .actionPending:   return 0.4
        case .actionSuccess:   return 0.6
        }
    }

    private func colorsFor(_ state: WidgetState) -> [CGColor] {
        switch state {
        case .actionSuccess:   return actionSuccessColors
        default:               return actionPendingColors
        }
    }

    private func rotationDurationFor(_ state: WidgetState) -> CFTimeInterval {
        switch state {
        case .actionSuccess:   return 2.0
        default:               return 6.0
        }
    }
}

// MARK: - Single Edge Window

/// A thin borderless window positioned at one screen edge.
/// Draws a gradient strip using Core Animation.
final class BorderEdgeWindow: NSWindow {
    enum Edge { case top, bottom, left, right }

    let edge: Edge
    private var gradientLayer: CAGradientLayer!

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    init(frame: NSRect, edge: Edge) {
        self.edge = edge

        super.init(
            contentRect: frame,
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )

        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue)
        ignoresMouseEvents = true
        isReleasedWhenClosed = false
        isMovable = false
        isMovableByWindowBackground = false
        acceptsMouseMovedEvents = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        alphaValue = 0

        setupLayer()
        ignoresMouseEvents = true
    }

    private func setupLayer() {
        let view = NSView(frame: NSRect(origin: .zero, size: frame.size))
        view.wantsLayer = true
        view.autoresizingMask = [.width, .height]
        contentView = view

        guard let rootLayer = view.layer else { return }

        gradientLayer = CAGradientLayer()
        gradientLayer.frame = rootLayer.bounds

        switch edge {
        case .top, .bottom:
            gradientLayer.startPoint = CGPoint(x: 0, y: 0.5)
            gradientLayer.endPoint = CGPoint(x: 1, y: 0.5)
        case .left, .right:
            gradientLayer.startPoint = CGPoint(x: 0.5, y: 0)
            gradientLayer.endPoint = CGPoint(x: 0.5, y: 1)
        }

        gradientLayer.colors = []
        gradientLayer.opacity = 0
        rootLayer.addSublayer(gradientLayer)

        addColorShift(duration: 6)
    }

    private func addColorShift(duration: CFTimeInterval) {
        let anim = CABasicAnimation(keyPath: "startPoint")
        let endAnim = CABasicAnimation(keyPath: "endPoint")

        switch edge {
        case .top, .bottom:
            anim.fromValue = CGPoint(x: 0, y: 0.5)
            anim.toValue = CGPoint(x: -1, y: 0.5)
            endAnim.fromValue = CGPoint(x: 1, y: 0.5)
            endAnim.toValue = CGPoint(x: 0, y: 0.5)
        case .left, .right:
            anim.fromValue = CGPoint(x: 0.5, y: 0)
            anim.toValue = CGPoint(x: 0.5, y: -1)
            endAnim.fromValue = CGPoint(x: 0.5, y: 1)
            endAnim.toValue = CGPoint(x: 0.5, y: 0)
        }

        let group = CAAnimationGroup()
        group.animations = [anim, endAnim]
        group.duration = duration
        group.repeatCount = .infinity
        group.isRemovedOnCompletion = false
        gradientLayer.add(group, forKey: "colorShift")
    }

    func updateBorder(
        thickness: CGFloat,
        colors: [CGColor],
        rotationDuration: CFTimeInterval,
        opacity: Float,
        isKnocking: Bool,
        isVoice: Bool,
        voicePulseDuration: CFTimeInterval
    ) {
        CATransaction.begin()
        CATransaction.setAnimationDuration(0.5)

        gradientLayer.colors = colors
        gradientLayer.opacity = opacity

        let bounds = contentView?.bounds ?? .zero
        switch edge {
        case .top:
            gradientLayer.frame = CGRect(x: 0, y: bounds.height - thickness, width: bounds.width, height: thickness)
        case .bottom:
            gradientLayer.frame = CGRect(x: 0, y: 0, width: bounds.width, height: thickness)
        case .left:
            gradientLayer.frame = CGRect(x: 0, y: 0, width: thickness, height: bounds.height)
        case .right:
            gradientLayer.frame = CGRect(x: bounds.width - thickness, y: 0, width: thickness, height: bounds.height)
        }

        CATransaction.commit()

        gradientLayer.removeAnimation(forKey: "colorShift")
        addColorShift(duration: rotationDuration)

        gradientLayer.removeAnimation(forKey: "knock")
        gradientLayer.removeAnimation(forKey: "pulse")
    }
}
