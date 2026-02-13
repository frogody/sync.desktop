import AppKit
import Combine
import QuartzCore

/// Manages 4 thin edge windows that together form a colored border around the screen.
/// Each window is only a few pixels wide, positioned flush against a screen edge.
/// This avoids the full-screen overlay approach which blocks mouse events on macOS.
///
/// Per-state visual treatment:
/// - compactChat:    thin steady rainbow, slow rotation
/// - expandedChat:   thicker rainbow, medium rotation
/// - voiceListening: pulsing pink/magenta, fast rotation
/// - voiceSpeaking:  rippling cyan/blue
/// - thinking:       fast-spinning rainbow
/// - knocking:       bouncing amber/orange pulses
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

    private let allColors: [CGColor] = [
        CGColor(red: 0.93, green: 0.28, blue: 0.60, alpha: 1),
        CGColor(red: 0.02, green: 0.71, blue: 0.83, alpha: 1),
        CGColor(red: 0.39, green: 0.40, blue: 0.95, alpha: 1),
        CGColor(red: 0.06, green: 0.73, blue: 0.51, alpha: 1),
        CGColor(red: 0.53, green: 0.94, blue: 0.67, alpha: 1),
        CGColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1),
        CGColor(red: 0.96, green: 0.25, blue: 0.37, alpha: 1),
        CGColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 1),
        CGColor(red: 0.93, green: 0.28, blue: 0.60, alpha: 1),
    ]

    private let voiceListenColors: [CGColor] = [
        CGColor(red: 0.93, green: 0.28, blue: 0.60, alpha: 1),
        CGColor(red: 0.96, green: 0.25, blue: 0.37, alpha: 1),
        CGColor(red: 0.85, green: 0.20, blue: 0.70, alpha: 1),
        CGColor(red: 0.93, green: 0.40, blue: 0.55, alpha: 1),
        CGColor(red: 0.93, green: 0.28, blue: 0.60, alpha: 1),
    ]

    private let voiceSpeakColors: [CGColor] = [
        CGColor(red: 0.02, green: 0.71, blue: 0.83, alpha: 1),
        CGColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 1),
        CGColor(red: 0.08, green: 0.72, blue: 0.65, alpha: 1),
        CGColor(red: 0.39, green: 0.40, blue: 0.95, alpha: 1),
        CGColor(red: 0.02, green: 0.71, blue: 0.83, alpha: 1),
    ]

    private let knockColors: [CGColor] = [
        CGColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1),
        CGColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 1),
        CGColor(red: 0.96, green: 0.25, blue: 0.37, alpha: 1),
        CGColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1),
        CGColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 1),
    ]

    // MARK: - Init

    init(viewModel: NotchViewModel) {
        self.viewModel = viewModel

        guard let screen = NSScreen.main else { return }
        let f = screen.frame
        let maxThickness: CGFloat = 8  // Max border thickness we'll ever need

        // Create 4 edge windows — thin strips along each edge
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
        // Show/hide based on context boost
        viewModel.$isContextBoosted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] boosted in
                self?.setVisible(boosted)
            }
            .store(in: &cancellables)

        // Update visual style based on widget state
        viewModel.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.updateForState(state)
            }
            .store(in: &cancellables)
    }

    private func setVisible(_ visible: Bool) {
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = visible ? 0.6 : 0.4
            for w in allWindows {
                w.animator().alphaValue = visible ? 1.0 : 0.0
            }
        }
    }

    // MARK: - Per-State Updates

    private func updateForState(_ state: WidgetState) {
        let thickness = thicknessFor(state)
        let colors = colorsFor(state)
        let speed = rotationDurationFor(state)
        let opacity = opacityFor(state)
        let isKnocking = state == .knocking
        let isVoice = state == .voiceListening || state == .voiceSpeaking

        for w in allWindows {
            w.updateBorder(
                thickness: thickness,
                colors: colors,
                rotationDuration: speed,
                opacity: opacity,
                isKnocking: isKnocking,
                isVoice: isVoice,
                voicePulseDuration: state == .voiceListening ? 0.6 : 0.9
            )
        }
    }

    // MARK: - State Config

    private func thicknessFor(_ state: WidgetState) -> CGFloat {
        switch state {
        case .idle, .hovering:     return 0
        case .compactChat:         return 2
        case .expandedChat:        return 3.5
        case .voiceListening:      return 3
        case .voiceSpeaking:       return 3
        case .thinking:            return 2.5
        case .knocking:            return 2
        }
    }

    private func opacityFor(_ state: WidgetState) -> Float {
        switch state {
        case .idle, .hovering:     return 0
        case .compactChat:         return 0.5
        case .expandedChat:        return 0.6
        case .voiceListening:      return 0.6
        case .voiceSpeaking:       return 0.55
        case .thinking:            return 0.5
        case .knocking:            return 0.55
        }
    }

    private func colorsFor(_ state: WidgetState) -> [CGColor] {
        switch state {
        case .voiceListening:  return voiceListenColors
        case .voiceSpeaking:   return voiceSpeakColors
        case .knocking:        return knockColors
        default:               return allColors
        }
    }

    private func rotationDurationFor(_ state: WidgetState) -> CFTimeInterval {
        switch state {
        case .thinking:        return 1.5
        case .voiceListening:  return 2.4
        case .voiceSpeaking:   return 3.3
        case .knocking:        return 3.0
        case .expandedChat:    return 4.6
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
        ignoresMouseEvents = true  // Re-assert after content view setup
    }

    private func setupLayer() {
        let view = NSView(frame: NSRect(origin: .zero, size: frame.size))
        view.wantsLayer = true
        view.autoresizingMask = [.width, .height]
        contentView = view

        guard let rootLayer = view.layer else { return }

        gradientLayer = CAGradientLayer()
        gradientLayer.frame = rootLayer.bounds

        // Gradient direction follows the edge
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

        // Animated color shift
        addColorShift(duration: 6)
    }

    private func addColorShift(duration: CFTimeInterval) {
        // Animate the start/end points to create a moving color effect
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

        // Resize gradient to match thickness (rest is transparent)
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

        // Update animation speed
        gradientLayer.removeAnimation(forKey: "colorShift")
        addColorShift(duration: rotationDuration)

        // Knocking: bounce animation on opacity
        gradientLayer.removeAnimation(forKey: "knock")
        gradientLayer.removeAnimation(forKey: "pulse")

        if isKnocking {
            let knock = CAKeyframeAnimation(keyPath: "opacity")
            knock.values = [opacity, 1.0, opacity * 0.3, 0.9, opacity * 0.3, 0.7, opacity]
            knock.keyTimes = [0, 0.14, 0.28, 0.42, 0.56, 0.70, 1.0]
            knock.duration = 1.5
            knock.repeatCount = 3
            gradientLayer.add(knock, forKey: "knock")
        }

        if isVoice {
            let pulse = CABasicAnimation(keyPath: "opacity")
            pulse.fromValue = opacity * 0.5
            pulse.toValue = opacity
            pulse.duration = voicePulseDuration
            pulse.autoreverses = true
            pulse.repeatCount = .infinity
            gradientLayer.add(pulse, forKey: "pulse")
        }
    }
}
