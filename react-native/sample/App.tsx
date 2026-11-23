import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { StreamPulse, ReactNativeVideoAdapter } from "@streampulse/react-native";

export default function App() {
  const [adapter] = useState(() => new ReactNativeVideoAdapter());
  const [hudStatus, setHudStatus] = useState("Initialized");

  useEffect(() => {
    StreamPulse.init({
      endpoint: "http://localhost:3000",
      appId: "dev.streampulse.rn.sample",
      debug: true,
    });

    const session = StreamPulse.attach(null, adapter, {
      contentId: "big_buck_bunny_rn",
      streamType: "vod",
      protocol: "hls",
      player: { name: "react-native-video", version: "6.0" },
    });

    setHudStatus("Attached to Session: " + session.sessionId);

    return () => {
      session.release();
    };
  }, [adapter]);

  const videoProps = adapter.getVideoProps();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>StreamPulse React Native Sample</Text>
      <Text style={styles.status}>{hudStatus}</Text>

      <View style={styles.videoPlaceholder}>
        <Text style={styles.videoText}>Video Player (react-native-video)</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => videoProps.onLoadStart()}
        >
          <Text style={styles.buttonText}>Load Start</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => videoProps.onReadyForDisplay()}
        >
          <Text style={styles.buttonText}>First Frame</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => videoProps.onBuffer({ isBuffering: true })}
        >
          <Text style={styles.buttonText}>Simulate Stall</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.dangerButton]}
          onPress={() =>
            videoProps.onError({
              error: { code: 5001, errorString: "Decode error" },
            })
          }
        >
          <Text style={styles.buttonText}>Simulate Error</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  status: {
    color: "#38bdf8",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  videoPlaceholder: {
    height: 220,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  videoText: {
    color: "#94a3b8",
    fontSize: 16,
  },
  controls: {
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  button: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  dangerButton: {
    backgroundColor: "#dc2626",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
