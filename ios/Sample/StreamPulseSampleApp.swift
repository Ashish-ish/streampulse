import SwiftUI
import AVKit
import StreamPulseSDK
import StreamPulseAVPlayer

@main
struct StreamPulseSampleApp: App {
    init() {
        let config = StreamPulseConfig(
            endpoint: URL(string: "http://localhost:3000")!,
            appId: "com.example.streampulse.ios",
            appVersion: "1.0.0",
            appBuild: "1",
            sampleRate: 1.0,
            debug: true
        )
        StreamPulse.initialize(config: config)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @StateObject private var viewModel = PlayerViewModel()

    var body: some View {
        VStack(spacing: 16) {
            Text("StreamPulse iOS Sample")
                .font(.title2)
                .bold()

            VideoPlayer(player: viewModel.player)
                .frame(height: 240)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                )

            HStack {
                Button("Play") { viewModel.play() }
                    .buttonStyle(.borderedProminent)
                Button("Pause") { viewModel.pause() }
                    .buttonStyle(.bordered)
                Button("Flush") { StreamPulse.flush() }
                    .buttonStyle(.bordered)
                Button("Simulate Error") { viewModel.simulateError() }
                    .buttonStyle(.bordered)
                    .tint(.red)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Live Telemetry HUD")
                    .font(.headline)
                HStack {
                    MetricBadge(label: "Startup", value: viewModel.startupText)
                    MetricBadge(label: "Rebuffers", value: "\(viewModel.rebufferCount)")
                    MetricBadge(label: "Dropped", value: "\(viewModel.droppedFrames)")
                }
                HStack {
                    MetricBadge(label: "Bitrate", value: viewModel.bitrateText)
                    MetricBadge(label: "QoE Score", value: viewModel.qoeText)
                }
            }
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(10)

            Spacer()
        }
        .padding()
        .onAppear {
            viewModel.setup()
        }
    }
}

struct MetricBadge: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(value)
                .font(.system(.body, design: .monospaced))
                .bold()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color.gray.opacity(0.15))
        .cornerRadius(6)
    }
}

final class PlayerViewModel: ObservableObject {
    let player: AVPlayer
    private var adapter: StreamPulseAVPlayer?
    private var session: StreamPulseSession?

    @Published var startupText: String = "-"
    @Published var rebufferCount: Int = 0
    @Published var droppedFrames: Int64 = 0
    @Published var bitrateText: String = "-"
    @Published var qoeText: String = "-"

    init() {
        let sampleURL = URL(string: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")!
        self.player = AVPlayer(url: sampleURL)
    }

    func setup() {
        let adapter = StreamPulseAVPlayer(player: player)
        self.adapter = adapter
        let meta = SessionMeta(
            contentId: "sample_bunny",
            streamType: .vod,
            protocolType: .progressive,
            player: PlayerInfo(name: "AVPlayer", version: "1.0")
        )
        self.session = StreamPulse.attach(player: player, adapter: adapter, sessionMeta: meta)
    }

    func play() {
        player.play()
    }

    func pause() {
        player.pause()
    }

    func simulateError() {
        session?.onError(code: 4004, fatal: true, message: "Simulated stream decode failure on iOS")
    }
}
