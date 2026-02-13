import SwiftUI

/// A shape that matches the physical notch's cutout silhouette.
/// Uses vertical walls with tight arc corners to match the real notch geometry.
struct NotchContourShape: Shape {
    var notchWidth: CGFloat = 185
    var notchHeight: CGFloat = 32
    var cornerRadius: CGFloat = 16
    var notchCornerRadius: CGFloat = 6  // Tight corners matching physical notch

    func path(in rect: CGRect) -> Path {
        var path = Path()

        let midX = rect.midX
        let halfNotch = notchWidth / 2

        let notchLeftX = midX - halfNotch
        let notchRightX = midX + halfNotch
        let ncr = notchCornerRadius

        // --- Start at top-left (after corner radius) ---
        path.move(to: CGPoint(x: rect.minX + cornerRadius, y: rect.minY))

        // Top edge to left notch wall
        path.addLine(to: CGPoint(x: notchLeftX, y: rect.minY))

        // Left wall of notch straight down (top is hidden behind physical notch)
        path.addLine(to: CGPoint(x: notchLeftX, y: rect.minY + notchHeight - ncr))

        // Bottom-left notch corner (tight arc)
        path.addArc(
            center: CGPoint(x: notchLeftX + ncr, y: rect.minY + notchHeight - ncr),
            radius: ncr,
            startAngle: .degrees(180),
            endAngle: .degrees(90),
            clockwise: true
        )

        // Bottom of notch
        path.addLine(to: CGPoint(x: notchRightX - ncr, y: rect.minY + notchHeight))

        // Bottom-right notch corner (tight arc)
        path.addArc(
            center: CGPoint(x: notchRightX - ncr, y: rect.minY + notchHeight - ncr),
            radius: ncr,
            startAngle: .degrees(90),
            endAngle: .degrees(0),
            clockwise: true
        )

        // Right wall of notch straight up
        path.addLine(to: CGPoint(x: notchRightX, y: rect.minY))

        // Top edge to right corner
        path.addLine(to: CGPoint(x: rect.maxX - cornerRadius, y: rect.minY))

        // Top-right rounded corner
        path.addArc(
            center: CGPoint(x: rect.maxX - cornerRadius, y: rect.minY + cornerRadius),
            radius: cornerRadius,
            startAngle: .degrees(-90),
            endAngle: .degrees(0),
            clockwise: false
        )

        // Right side down
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - cornerRadius))

        // Bottom-right rounded corner
        path.addArc(
            center: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY - cornerRadius),
            radius: cornerRadius,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )

        // Bottom edge
        path.addLine(to: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY))

        // Bottom-left rounded corner
        path.addArc(
            center: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY - cornerRadius),
            radius: cornerRadius,
            startAngle: .degrees(90),
            endAngle: .degrees(180),
            clockwise: false
        )

        // Left side up
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + cornerRadius))

        // Top-left rounded corner
        path.addArc(
            center: CGPoint(x: rect.minX + cornerRadius, y: rect.minY + cornerRadius),
            radius: cornerRadius,
            startAngle: .degrees(180),
            endAngle: .degrees(270),
            clockwise: false
        )

        return path
    }
}
