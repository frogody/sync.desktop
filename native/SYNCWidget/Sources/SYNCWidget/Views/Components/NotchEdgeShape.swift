import SwiftUI

/// An open path tracing the outer sides and bottom of the dark notch bar.
/// The top edge is excluded (it's hidden behind the physical notch).
/// Colors extend from the top-left corner, down, across the bottom, and up to the top-right corner.
struct NotchEdgeShape: Shape {
    var cornerRadius: CGFloat = 16

    func path(in rect: CGRect) -> Path {
        var path = Path()

        // Start at the top of the left side (right after the top-left corner)
        path.move(to: CGPoint(x: rect.minX, y: rect.minY + cornerRadius))

        // Down the left side
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - cornerRadius))

        // Bottom-left rounded corner
        path.addArc(
            center: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY - cornerRadius),
            radius: cornerRadius,
            startAngle: .degrees(180),
            endAngle: .degrees(90),
            clockwise: true
        )

        // Across the bottom
        path.addLine(to: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY))

        // Bottom-right rounded corner
        path.addArc(
            center: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY - cornerRadius),
            radius: cornerRadius,
            startAngle: .degrees(90),
            endAngle: .degrees(0),
            clockwise: true
        )

        // Up the right side
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + cornerRadius))

        return path
    }
}
