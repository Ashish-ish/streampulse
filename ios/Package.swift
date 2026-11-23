// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "StreamPulse",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
        .tvOS(.v15)
    ],
    products: [
        .library(
            name: "StreamPulseSDK",
            targets: ["StreamPulseSDK"]
        ),
        .library(
            name: "StreamPulseAVPlayer",
            targets: ["StreamPulseAVPlayer"]
        ),
        .executable(
            name: "StreamPulseTests",
            targets: ["StreamPulseTests"]
        )
    ],
    targets: [
        .target(
            name: "StreamPulseSDK",
            path: "Sources/StreamPulseSDK"
        ),
        .target(
            name: "StreamPulseAVPlayer",
            dependencies: ["StreamPulseSDK"],
            path: "Sources/StreamPulseAVPlayer"
        ),
        .executableTarget(
            name: "StreamPulseTests",
            dependencies: ["StreamPulseSDK", "StreamPulseAVPlayer"],
            path: "Tests/StreamPulseSDKTests"
        )
    ]
)
