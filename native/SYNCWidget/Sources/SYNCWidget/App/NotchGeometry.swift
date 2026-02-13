import AppKit

/// Detects the physical notch dimensions on the current display.
/// Uses NSScreen.safeAreaInsets (macOS 12+) to determine notch presence and position.
struct NotchGeometry {
    let hasNotch: Bool
    let notchWidth: CGFloat
    let notchHeight: CGFloat
    let screenFrame: NSRect
    let notchRect: NSRect       // In screen coordinates (bottom-left origin)
    let menuBarHeight: CGFloat

    /// Detect notch geometry for the main screen.
    static func detect() -> NotchGeometry {
        guard let screen = NSScreen.main else {
            return .noNotch
        }

        let frame = screen.frame
        let visibleFrame = screen.visibleFrame
        let insets = screen.safeAreaInsets

        // A notch is present when the top safe area inset exceeds the standard
        // menu bar height. The menu bar is typically ~24pt; notch Macs have
        // safeAreaInsets.top of ~32-38pt depending on the model.
        let hasNotch = insets.top > 24

        if hasNotch {
            // The notch is centered horizontally on the screen.
            // Width varies by model: ~206pt on 14", ~189pt on 16".
            // We use the auxiliaryTopLeftArea and auxiliaryTopRightArea to compute
            // the notch width precisely: notchWidth = screenWidth - leftArea - rightArea.
            let leftAreaWidth = screen.auxiliaryTopLeftArea?.width ?? 0
            let rightAreaWidth = screen.auxiliaryTopRightArea?.width ?? 0
            let notchWidth = max(frame.width - leftAreaWidth - rightAreaWidth, 180)
            let notchHeight = insets.top

            // Notch rect in screen coordinates (AppKit: bottom-left origin).
            // The notch sits at the very top of the screen.
            let notchX = frame.origin.x + (frame.width - notchWidth) / 2
            let notchY = frame.origin.y + frame.height - notchHeight

            return NotchGeometry(
                hasNotch: true,
                notchWidth: notchWidth,
                notchHeight: notchHeight,
                screenFrame: frame,
                notchRect: NSRect(x: notchX, y: notchY, width: notchWidth, height: notchHeight),
                menuBarHeight: notchHeight // On notch Macs, menu bar height == notch height
            )
        }

        // No notch: use standard menu bar area
        let menuBarHeight = frame.height - visibleFrame.height - (visibleFrame.origin.y - frame.origin.y)
        return NotchGeometry(
            hasNotch: false,
            notchWidth: 200, // Fallback capsule width
            notchHeight: menuBarHeight,
            screenFrame: frame,
            notchRect: NSRect(
                x: frame.origin.x + (frame.width - 200) / 2,
                y: frame.origin.y + frame.height - menuBarHeight,
                width: 200,
                height: menuBarHeight
            ),
            menuBarHeight: menuBarHeight
        )
    }

    static let noNotch = NotchGeometry(
        hasNotch: false,
        notchWidth: 200,
        notchHeight: 24,
        screenFrame: NSRect(x: 0, y: 0, width: 1440, height: 900),
        notchRect: NSRect(x: 620, y: 876, width: 200, height: 24),
        menuBarHeight: 24
    )
}
