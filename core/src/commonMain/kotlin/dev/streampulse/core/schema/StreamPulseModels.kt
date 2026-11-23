// Generated automatically from spec/event-schema.v1.json. DO NOT EDIT BY HAND.
package dev.streampulse.core.schema

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
enum class Platform {
    @SerialName("android") ANDROID,
    @SerialName("ios") IOS,
    @SerialName("web") WEB,
    @SerialName("rn") RN
}

@Serializable
enum class NetworkType {
    @SerialName("wifi") WIFI,
    @SerialName("cellular") CELLULAR,
    @SerialName("ethernet") ETHERNET,
    @SerialName("none") NONE,
    @SerialName("unknown") UNKNOWN
}

@Serializable
enum class StreamType {
    @SerialName("vod") VOD,
    @SerialName("live") LIVE
}

@Serializable
enum class Protocol {
    @SerialName("hls") HLS,
    @SerialName("dash") DASH,
    @SerialName("progressive") PROGRESSIVE
}

@Serializable
enum class PlaybackEndReason {
    @SerialName("ended") ENDED,
    @SerialName("user_exit") USER_EXIT,
    @SerialName("error") ERROR,
    @SerialName("background") BACKGROUND
}

@Serializable
enum class AppHealthKind {
    @SerialName("crash") CRASH,
    @SerialName("anr") ANR,
    @SerialName("hang") HANG,
    @SerialName("native_crash") NATIVE_CRASH
}

@Serializable
data class SdkInfo(
    val name: String,
    val version: String
)

@Serializable
data class AppInfo(
    val id: String,
    val version: String,
    val build: String
)

@Serializable
data class DeviceInfo(
    @SerialName("install_id") val installId: String,
    val platform: Platform,
    @SerialName("os_version") val osVersion: String,
    val model: String,
    @SerialName("network_type") val networkType: NetworkType
)

@Serializable
data class PlayerInfo(
    val name: String,
    val version: String
)

@Serializable
data class StreamPulseEvent(
    val type: String,
    @SerialName("session_id") val sessionId: String,
    @SerialName("play_id") val playId: String,
    val seq: Int,
    @SerialName("t_mono_ms") val tMonoMs: Long,
    @SerialName("t_wall") val tWall: String,
    val data: JsonObject
)

@Serializable
data class StreamPulseBatch(
    @SerialName("schema_version") val schemaVersion: String = "1.0",
    @SerialName("batch_id") val batchId: String,
    @SerialName("sent_at") val sentAt: String,
    val sdk: SdkInfo,
    val app: AppInfo,
    val device: DeviceInfo,
    val events: List<StreamPulseEvent>
)
