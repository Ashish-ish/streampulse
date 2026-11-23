export interface NativeConfig {
  endpoint: string;
  appId: string;
  appVersion: string;
  appBuild: string;
  sampleRate: number;
  flushIntervalMs: number;
  maxBatchSize: number;
  maxQueueBytes: number;
  debug: boolean;
}

export interface NativeSessionMeta {
  contentId?: string;
  streamType: string;
  protocol: string;
  playerName: string;
  playerVersion: string;
  cdn?: string;
}

export interface Spec {
  initialize(config: NativeConfig): void;
  createSession(meta: NativeSessionMeta): string;
  emitEvent(sessionId: string, type: string, dataJson: string): void;
  releaseSession(sessionId: string): void;
  setEnabled(enabled: boolean): void;
  flush(): Promise<boolean>;
}

// Global TurboModuleRegistry fallback for tests or web mocking
let nativeModule: Spec | null = null;

export function getNativeStreamPulse(): Spec {
  if (nativeModule) return nativeModule;

  // In real RN runtime: TurboModuleRegistry.getEnforcing<Spec>("StreamPulse")
  // For unit tests / mocked environment:
  const globalObj = globalThis as any;
  if (globalObj.__turboModuleProxy && globalObj.__turboModuleProxy("StreamPulse")) {
    nativeModule = globalObj.__turboModuleProxy("StreamPulse");
    return nativeModule!;
  }

  // In-memory mock fallback when running outside native runtime
  nativeModule = {
    initialize: () => {},
    createSession: () => "mock-session-" + Math.random().toString(36).substring(2, 10),
    emitEvent: () => {},
    releaseSession: () => {},
    setEnabled: () => {},
    flush: async () => true,
  };
  return nativeModule!;
}

export function setMockNativeStreamPulse(mock: Spec | null) {
  nativeModule = mock;
}
