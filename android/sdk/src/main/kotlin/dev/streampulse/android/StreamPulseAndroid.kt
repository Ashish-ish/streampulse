package dev.streampulse.android

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import dev.streampulse.core.StreamPulse
import dev.streampulse.core.StreamPulseConfig
import dev.streampulse.core.schema.AppHealthKind
import dev.streampulse.core.schema.Platform
import dev.streampulse.core.schema.StreamPulseEvent
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.util.UUID

object StreamPulseAndroid {
    private const val PREFS_NAME = "streampulse_prefs"
    private const val KEY_INSTALL_ID = "install_id"
    private const val BREADCRUMB_FILE = "streampulse_breadcrumb.json"

    fun init(context: Context, config: StreamPulseConfig) {
        val appContext = context.applicationContext
        val installId = getOrCreateInstallId(appContext)

        val androidConfig = config.copy(
            platform = Platform.ANDROID,
            sdkName = "streampulse-android"
        )

        StreamPulse.setInstallId(installId)
        StreamPulse.init(androidConfig)

        // Setup crash & ANR correlation
        setupUncaughtExceptionHandler(appContext)
        checkHistoricalExitReasons(appContext)
    }

    fun updateBreadcrumb(context: Context, sessionId: String) {
        try {
            val file = File(context.filesDir, BREADCRUMB_FILE)
            val json = """{"session_id":"$sessionId","updated_at":${System.currentTimeMillis()}}"""
            file.writeText(json)
        } catch (_: Throwable) {}
    }

    private fun getOrCreateInstallId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var id = prefs.getString(KEY_INSTALL_ID, null)
        if (id == null) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_INSTALL_ID, id).apply()
        }
        return id
    }

    private fun checkHistoricalExitReasons(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return
                val exitReasons = am.getHistoricalProcessExitReasons(context.packageName, 0, 5)

                val breadcrumb = readBreadcrumb(context) ?: return
                val lastSessionId = breadcrumb.sessionId

                for (info in exitReasons) {
                    val kind = when (info.reason) {
                        ApplicationExitInfo.REASON_ANR -> AppHealthKind.ANR
                        ApplicationExitInfo.REASON_CRASH_NATIVE -> AppHealthKind.NATIVE_CRASH
                        ApplicationExitInfo.REASON_CRASH -> AppHealthKind.CRASH
                        else -> null
                    }

                    if (kind != null) {
                        // Correlate with last active session
                        emitAppHealth(lastSessionId, kind, info.timestamp)
                        // Clear breadcrumb after correlation to prevent double counting
                        clearBreadcrumb(context)
                        break
                    }
                }
            } catch (_: Throwable) {}
        }
    }

    private fun setupUncaughtExceptionHandler(context: Context) {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val breadcrumb = readBreadcrumb(context)
                if (breadcrumb != null) {
                    val file = File(context.filesDir, "streampulse_crash_flag.txt")
                    file.writeText("${breadcrumb.sessionId}:${System.currentTimeMillis()}")
                }
            } catch (_: Throwable) {
            } finally {
                defaultHandler?.uncaughtException(thread, throwable)
            }
        }
    }

    private fun emitAppHealth(sessionId: String, kind: AppHealthKind, occurredAtMs: Long) {
        val event = StreamPulseEvent(
            type = "app_health",
            sessionId = sessionId,
            playId = UUID.randomUUID().toString(),
            seq = 9999,
            tMonoMs = System.nanoTime() / 1_000_000L,
            tWall = java.time.Instant.ofEpochMilli(occurredAtMs).toString(),
            data = buildJsonObject {
                put("kind", kind.name.lowercase())
                put("occurred_at", java.time.Instant.ofEpochMilli(occurredAtMs).toString())
            }
        )
        // Flush queue or dispatch
    }

    private data class BreadcrumbData(val sessionId: String, val updatedAt: Long)

    private fun readBreadcrumb(context: Context): BreadcrumbData? {
        return try {
            val file = File(context.filesDir, BREADCRUMB_FILE)
            if (!file.exists()) return null
            val content = file.readText()
            val match = Regex(""""session_id":"([^"]+)"""").find(content)
            val sid = match?.groupValues?.get(1) ?: return null
            BreadcrumbData(sid, System.currentTimeMillis())
        } catch (_: Throwable) {
            null
        }
    }

    private fun clearBreadcrumb(context: Context) {
        try {
            File(context.filesDir, BREADCRUMB_FILE).delete()
        } catch (_: Throwable) {}
    }
}
