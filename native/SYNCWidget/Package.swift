// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SYNCWidget",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "SYNCWidget",
            path: "Sources/SYNCWidget",
            resources: [
                .copy("../../Resources/Info.plist")
            ]
        )
    ]
)
