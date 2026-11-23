package dev.streampulse.sample

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import dev.streampulse.android.StreamPulseAndroid
import dev.streampulse.core.StreamPulse
import dev.streampulse.core.StreamPulseConfig
import dev.streampulse.core.StreamPulseSession
import dev.streampulse.core.session.SessionMetadata
import dev.streampulse.media3.Media3Adapter

class MainActivity : ComponentActivity() {
    private var player: ExoPlayer? = null
    private var telemetrySession: StreamPulseSession? = null
    private var adapter: Media3Adapter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize StreamPulse Android SDK
        StreamPulseAndroid.init(
            this,
            StreamPulseConfig(
                endpoint = "http://10.0.2.2:3000",
                appId = "dev.streampulse.sample",
                appVersion = "1.0.0",
                debug = true
            )
        )

        setContent {
            SampleAppScreen(
                onForceCrash = {
                    throw RuntimeException("StreamPulse Demo: Forced Test Crash for UncaughtHandler Verification")
                },
                onForceANR = {
                    // Block main thread to trigger ANR
                    Thread.sleep(12000)
                }
            )
        }
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    fun SampleAppScreen(onForceCrash: () -> Unit, onForceANR: () -> Unit) {
        val testStreams = listOf(
            "Tears of Steel (HLS)" to "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            "Big Buck Bunny (MP4)" to "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
        )
        var selectedStream by remember { mutableStateOf(testStreams[0]) }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("StreamPulse QoE Demo") },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                )
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                // Video Player Area
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(240.dp)
                        .background(Color.Black)
                ) {
                    AndroidView(
                        factory = { ctx ->
                            PlayerView(ctx).also { playerView ->
                                val exoPlayer = ExoPlayer.Builder(ctx).build()
                                player = exoPlayer
                                playerView.player = exoPlayer

                                val media3Adapter = Media3Adapter()
                                adapter = media3Adapter

                                telemetrySession = StreamPulse.attach(
                                    exoPlayer,
                                    media3Adapter,
                                    SessionMetadata(
                                        contentId = selectedStream.first,
                                        streamType = "vod",
                                        protocol = if (selectedStream.second.endsWith("m3u8")) "hls" else "progressive",
                                        playerName = "Media3 ExoPlayer",
                                        playerVersion = "1.5.1"
                                    )
                                )

                                exoPlayer.setMediaItem(MediaItem.fromUri(selectedStream.second))
                                exoPlayer.prepare()
                                exoPlayer.playWhenReady = true
                            }
                        },
                        modifier = Modifier.fillMaxSize()
                    )

                    // Debug HUD Overlay
                    Column(
                        modifier = Modifier
                            .padding(8.dp)
                            .background(Color(0xAA000000))
                            .padding(8.dp)
                    ) {
                        Text("HUD: Live QoE Telemetry", color = Color.Green, fontSize = 11.sp)
                        Text("Stream: ${selectedStream.first}", color = Color.White, fontSize = 10.sp)
                        Text("Session ID: ${telemetrySession?.sessionId?.take(8)}...", color = Color.Cyan, fontSize = 10.sp)
                        Text("Status: Attached & Active", color = Color.White, fontSize = 10.sp)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Stream Controls & Fault Injection
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Stream Selector", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        testStreams.forEach { stream ->
                            Button(
                                onClick = {
                                    selectedStream = stream
                                    player?.setMediaItem(MediaItem.fromUri(stream.second))
                                    player?.prepare()
                                    player?.playWhenReady = true
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (selectedStream == stream) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer
                                )
                            ) {
                                Text(stream.first.split(" ")[0])
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                    Text("Fault Injection & Health Correlation", style = MaterialTheme.typography.titleMedium)
                    Text("Verify ApplicationExitInfo and breadcrumb correlation", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            onClick = onForceCrash,
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                        ) {
                            Text("Force Crash")
                        }

                        Button(
                            onClick = onForceANR,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706))
                        ) {
                            Text("Force ANR")
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        telemetrySession?.release()
        adapter?.detach()
        player?.release()
        super.onDestroy()
    }
}
