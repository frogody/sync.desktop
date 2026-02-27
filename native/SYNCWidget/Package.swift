// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SYNCWidget",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/ml-explore/mlx-swift", from: "0.21.0"),
        .package(url: "https://github.com/ml-explore/mlx-swift-lm", .upToNextMinor(from: "2.29.1")),
    ],
    targets: [
        .executableTarget(
            name: "SYNCWidget",
            dependencies: [
                .product(name: "MLX", package: "mlx-swift"),
                .product(name: "MLXLLM", package: "mlx-swift-lm"),
                .product(name: "MLXLMCommon", package: "mlx-swift-lm"),
            ],
            path: "Sources/SYNCWidget",
            resources: [
                .copy("../../Resources/Info.plist")
            ]
        )
    ]
)
