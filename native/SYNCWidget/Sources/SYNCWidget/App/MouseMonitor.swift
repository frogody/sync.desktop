import AppKit
import ApplicationServices

/// Tracks global mouse position relative to the notch area.
/// Reports proximity intensity (0-1) and handles click detection.
final class MouseMonitor {
    private let geometry: NotchGeometry
    private var globalMonitor: Any?
    private var localMonitor: Any?
    private var lastUpdateTime: TimeInterval = 0
    private let throttleInterval: TimeInterval = 1.0 / 60.0  // 60fps

    // Proximity zone: elliptical area around the notch
    private let horizontalRadius: CGFloat = 120  // px beyond notch edges
    private let verticalRadius: CGFloat = 60     // px below notch

    // Callbacks
    var onProximityChange: ((CGFloat, CGFloat) -> Void)?  // (distance, maxDistance)
    var onClick: (() -> Void)?
    var onForceClick: (() -> Void)?
    var onDoubleClick: (() -> Void)?
    var onMouseEntered: (() -> Void)?
    var onMouseExited: (() -> Void)?

    private var isInsideProximity = false

    init(geometry: NotchGeometry) {
        self.geometry = geometry
    }

    func start() {
        // Don't start global monitoring without accessibility — it triggers the macOS dialog
        if !AXIsProcessTrusted() {
            return
        }

        // Global monitor: captures events when our app is NOT focused
        globalMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.mouseMoved, .leftMouseDown, .pressure]
        ) { [weak self] event in
            self?.handleEvent(event)
        }

        // Local monitor: captures events when our app IS focused (panel clicked)
        localMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.mouseMoved, .leftMouseDown, .pressure, .leftMouseUp]
        ) { [weak self] event in
            self?.handleEvent(event)
            return event
        }
    }

    func stop() {
        if let monitor = globalMonitor {
            NSEvent.removeMonitor(monitor)
            globalMonitor = nil
        }
        if let monitor = localMonitor {
            NSEvent.removeMonitor(monitor)
            localMonitor = nil
        }
    }

    private func handleEvent(_ event: NSEvent) {
        switch event.type {
        case .mouseMoved:
            handleMouseMoved(event)
        case .leftMouseDown:
            // Only handle clicks within the notch proximity zone
            guard isInsideProximity else { return }
            if event.clickCount == 2 {
                onDoubleClick?()
            } else if event.clickCount == 1 {
                onClick?()
            }
        case .pressure:
            // Force click: pressure stage >= 2 (deep press), only in proximity
            guard isInsideProximity else { return }
            if event.stage >= 2 {
                onForceClick?()
            }
        default:
            break
        }
    }

    private func handleMouseMoved(_ event: NSEvent) {
        // Throttle to 60fps
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastUpdateTime >= throttleInterval else { return }
        lastUpdateTime = now

        // Get mouse position in screen coordinates
        let mouseLocation = NSEvent.mouseLocation

        // Calculate distance to notch center
        let notchCenter = CGPoint(
            x: geometry.notchRect.midX,
            y: geometry.notchRect.midY
        )

        // Elliptical distance calculation
        let dx = mouseLocation.x - notchCenter.x
        let dy = mouseLocation.y - notchCenter.y
        let hRadius = (geometry.notchWidth / 2) + horizontalRadius
        let vRadius = geometry.notchHeight + verticalRadius

        let normalizedDistance = sqrt(
            pow(dx / hRadius, 2) + pow(dy / vRadius, 2)
        )

        let isInside = normalizedDistance < 1.0
        let maxDistance = max(hRadius, vRadius)
        let distance = normalizedDistance * maxDistance

        // Report proximity
        onProximityChange?(distance, maxDistance)

        // Track enter/exit
        if isInside && !isInsideProximity {
            isInsideProximity = true
            DispatchQueue.main.async { [weak self] in
                self?.onMouseEntered?()
            }
        } else if !isInside && isInsideProximity {
            isInsideProximity = false
            DispatchQueue.main.async { [weak self] in
                self?.onMouseExited?()
            }
        }
    }

    deinit {
        stop()
    }
}
