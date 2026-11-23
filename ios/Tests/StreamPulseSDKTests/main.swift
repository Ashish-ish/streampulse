import Foundation
import StreamPulseSDK

struct GoldenFixtureFile: Codable {
    let id: String
    let name: String
    let description: String
    let batch: StreamPulseBatch
    let expected: ExpectedRollup
}

struct ExpectedRollup: Codable {
    let startupMs: Int64?
    let vsf: Bool
    let ebvs: Bool
    let exitBeforeStartOther: Bool
    let watchMs: Int64
    let seekMs: Int64
    let rebufferMs: Int64
    let rebufferCount: Int
    let playTimeMs: Int64
    let rebufferRatio: String?
    let rebuffersPerHour: String?
    let rebufferBucket: String?
    let dropped: Int64
    let rendered: Int64
    let droppedFrameRatio: String?
    let droppedFrameBucket: String?
    let avgBitrateBps: Int64?
    let bitrateSwitchCount: Int
    let hasFirstFrame: Bool
    let playbackFailure: Bool
    let appHealthKinds: [String]
    let crashOrAnr: Bool
    let qoe: String?
    let clockRegression: Bool
    let seqGaps: Int

    enum CodingKeys: String, CodingKey {
        case startupMs = "startup_ms"
        case vsf
        case ebvs
        case exitBeforeStartOther = "exit_before_start_other"
        case watchMs = "watch_ms"
        case seekMs = "seek_ms"
        case rebufferMs = "rebuffer_ms"
        case rebufferCount = "rebuffer_count"
        case playTimeMs = "play_time_ms"
        case rebufferRatio = "rebuffer_ratio"
        case rebuffersPerHour = "rebuffers_per_hour"
        case rebufferBucket = "rebuffer_bucket"
        case dropped
        case rendered
        case droppedFrameRatio = "dropped_frame_ratio"
        case droppedFrameBucket = "dropped_frame_bucket"
        case avgBitrateBps = "avg_bitrate_bps"
        case bitrateSwitchCount = "bitrate_switch_count"
        case hasFirstFrame = "has_first_frame"
        case playbackFailure = "playback_failure"
        case appHealthKinds = "app_health_kinds"
        case crashOrAnr = "crash_or_anr"
        case qoe
        case clockRegression = "clock_regression"
        case seqGaps = "seq_gaps"
    }
}

func checkEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String) {
    if actual != expected {
        print("FAIL: \(message) - Expected: \(expected), got: \(actual)")
        exit(1)
    }
}

print("Running StreamPulse Swift Test Suite...")

// 1. Test Golden Fixtures Parity
let fixtureNames = [
    "golden-nominal-playback.json",
    "golden-rebuffer-and-seek.json",
    "golden-video-start-failure.json",
    "golden-exit-before-start.json",
    "golden-dropped-frames-and-bitrate.json",
    "golden-crash-and-anr.json",
    "golden-playback-failure-midstream.json"
]

let fileManager = FileManager.default
let currentPath = fileManager.currentDirectoryPath
let possibleDirs = [
    "\(currentPath)/spec/fixtures",
    "\(currentPath)/../spec/fixtures",
    "\(currentPath)/../../spec/fixtures"
]

guard let fixtureDir = possibleDirs.first(where: { fileManager.fileExists(atPath: "\($0)/\(fixtureNames[0])") }) else {
    print("FAIL: Could not locate spec/fixtures directory")
    exit(1)
}

for fileName in fixtureNames {
    let fileURL = URL(fileURLWithPath: "\(fixtureDir)/\(fileName)")
    let data = try Data(contentsOf: fileURL)
    let fixture = try JSONDecoder().decode(GoldenFixtureFile.self, from: data)

    let computed = MetricFold.compute(events: fixture.batch.events)
    let exp = fixture.expected

    checkEqual(computed.startupMs, exp.startupMs, "\(fileName): startupMs")
    checkEqual(computed.vsf, exp.vsf, "\(fileName): vsf")
    checkEqual(computed.ebvs, exp.ebvs, "\(fileName): ebvs")
    checkEqual(computed.exitBeforeStartOther, exp.exitBeforeStartOther, "\(fileName): exitBeforeStartOther")
    checkEqual(computed.watchMs, exp.watchMs, "\(fileName): watchMs")
    checkEqual(computed.seekMs, exp.seekMs, "\(fileName): seekMs")
    checkEqual(computed.rebufferMs, exp.rebufferMs, "\(fileName): rebufferMs")
    checkEqual(computed.rebufferCount, exp.rebufferCount, "\(fileName): rebufferCount")
    checkEqual(computed.playTimeMs, exp.playTimeMs, "\(fileName): playTimeMs")
    checkEqual(computed.rebufferRatio, exp.rebufferRatio, "\(fileName): rebufferRatio")
    checkEqual(computed.rebuffersPerHour, exp.rebuffersPerHour, "\(fileName): rebuffersPerHour")
    checkEqual(computed.rebufferBucket, exp.rebufferBucket, "\(fileName): rebufferBucket")
    checkEqual(computed.dropped, exp.dropped, "\(fileName): dropped")
    checkEqual(computed.rendered, exp.rendered, "\(fileName): rendered")
    checkEqual(computed.droppedFrameRatio, exp.droppedFrameRatio, "\(fileName): droppedFrameRatio")
    checkEqual(computed.droppedFrameBucket, exp.droppedFrameBucket, "\(fileName): droppedFrameBucket")
    checkEqual(computed.avgBitrateBps, exp.avgBitrateBps, "\(fileName): avgBitrateBps")
    checkEqual(computed.bitrateSwitchCount, exp.bitrateSwitchCount, "\(fileName): bitrateSwitchCount")
    checkEqual(computed.hasFirstFrame, exp.hasFirstFrame, "\(fileName): hasFirstFrame")
    checkEqual(computed.playbackFailure, exp.playbackFailure, "\(fileName): playbackFailure")
    checkEqual(computed.appHealthKinds, exp.appHealthKinds, "\(fileName): appHealthKinds")
    checkEqual(computed.crashOrAnr, exp.crashOrAnr, "\(fileName): crashOrAnr")
    checkEqual(computed.qoe, exp.qoe, "\(fileName): qoe")
    checkEqual(computed.clockRegression, exp.clockRegression, "\(fileName): clockRegression")
    checkEqual(computed.seqGaps, exp.seqGaps, "\(fileName): seqGaps")
}
print("✓ [Golden Fixtures] All 7 golden fixtures match Python metric oracle parity exactly")

// 2. Test EventQueue Eviction Priority
let queue = EventQueue(maxEvents: 3, maxBytes: 100_000)

queue.enqueue(StreamPulseEvent(
    type: "buffering_start",
    sessionId: "s1",
    playId: "p1",
    seq: 0,
    tMonoMs: 100,
    tWall: "2026-11-23T12:00:00Z",
    data: [:]
))

queue.enqueue(StreamPulseEvent(
    type: "app_health",
    sessionId: "s1",
    playId: "p1",
    seq: 1,
    tMonoMs: 200,
    tWall: "2026-11-23T12:00:01Z",
    data: ["kind": AnyCodable(.string("crash"))]
))

queue.enqueue(StreamPulseEvent(
    type: "quality_change",
    sessionId: "s1",
    playId: "p1",
    seq: 2,
    tMonoMs: 300,
    tWall: "2026-11-23T12:00:02Z",
    data: [:]
))

checkEqual(queue.count(), 3, "Queue initial count")

// 4th event forces eviction of seq 0
queue.enqueue(StreamPulseEvent(
    type: "dropped_frames",
    sessionId: "s1",
    playId: "p1",
    seq: 3,
    tMonoMs: 400,
    tWall: "2026-11-23T12:00:03Z",
    data: [:]
))

checkEqual(queue.count(), 3, "Queue bounded count")
let remaining = queue.peek(count: 3)
let types = remaining.map { $0.type }

checkEqual(types.contains("app_health"), true, "Critical event must be retained")
checkEqual(remaining.contains { $0.seq == 0 }, false, "Oldest non-critical event must be evicted")
print("✓ [EventQueue] Critical events prioritized during queue eviction")

// 3. Test Scrubber
let dirty = "Error loading https://cdn.internal.net/video.mp4?secret=xyz123 message"
let clean = Scrubber.scrub(message: dirty)
checkEqual(clean.contains("secret=xyz123"), false, "Scrubber secret removal")
checkEqual(clean.contains("cdn.internal.net"), false, "Scrubber host removal")
checkEqual(clean.contains("[url]"), true, "Scrubber [url] marker")
print("✓ [Scrubber] URLs and query parameters redacted")

// 4. Test Sampling
checkEqual(Sampling.isSessionSampled(sessionId: "session-1", sampleRate: 1.0), true, "Sample rate 1.0")
checkEqual(Sampling.isSessionSampled(sessionId: "session-1", sampleRate: 0.0), false, "Sample rate 0.0")
let hash1 = Sampling.fnv1a32("test-hash")
let hash2 = Sampling.fnv1a32("test-hash")
checkEqual(hash1, hash2, "Deterministic FNV-1a hash")
print("✓ [Sampling] Deterministic FNV-1a hashing & sampling boundaries")

// 5. Test IntervalMath
let iv1 = Interval(100, 500)
let iv2 = Interval(300, 700)
checkEqual(IntervalMath.measure([iv1]), 400, "Interval duration")
let clipped = IntervalMath.clip([iv1], start: 200, end: 400)
checkEqual(clipped.count, 1, "Clipped count")
checkEqual(clipped[0].start, 200, "Clipped start")
checkEqual(clipped[0].end, 400, "Clipped end")

let baseInterval = Interval(1000, 5000)
let cuts = [Interval(2000, 3000)]
let remainingIntervals = IntervalMath.subtractAll(interval: baseInterval, cuts: cuts)
checkEqual(remainingIntervals.count, 2, "Subtract pieces count")
checkEqual(IntervalMath.measure(remainingIntervals), 3000, "Remaining duration after cut")
print("✓ [IntervalMath] Interval measure, clip, and subtraction math")

// 6. Test BreadcrumbStore
let breadcrumbStore = BreadcrumbStore(fileName: "test_breadcrumb.json")
breadcrumbStore.save(sessionId: "sess-bread-123", monoMs: 98765)
let loadedBreadcrumb = breadcrumbStore.read()
checkEqual(loadedBreadcrumb?.sessionId, "sess-bread-123", "Breadcrumb session ID")
checkEqual(loadedBreadcrumb?.lastHeartbeatMonoMs, 98765, "Breadcrumb mono ms")
breadcrumbStore.clear()
checkEqual(breadcrumbStore.read(), nil, "Breadcrumb cleared")
print("✓ [BreadcrumbStore] Atomic breadcrumb write, read, and clear")

// 7. Test StreamPulse SDK Facade
StreamPulse.initialize(config: StreamPulseConfig(
    endpoint: URL(string: "http://localhost:3000")!,
    appId: "com.test.ios"
))
StreamPulse.setEnabled(true)
let meta = SessionMeta(contentId: "test_ios_video")
let testSession = StreamPulse.attach(
    player: "mock_player",
    adapter: MockTestAdapter(),
    sessionMeta: meta
)
checkEqual(testSession != nil, true, "Session creation")
testSession?.onPlayRequested()
testSession?.onFirstFrame()
testSession?.release()
print("✓ [StreamPulse] SDK facade initialization and session lifecycle")

print("\nAll Swift tests passed (7/7)!")

class MockTestAdapter: PlayerAdapter, @unchecked Sendable {
    func attach(listener: PlayerListener) {}
    func detach() {}
}
