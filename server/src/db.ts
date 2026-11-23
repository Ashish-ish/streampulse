import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

export interface DatabaseOptions {
  filePath?: string;
  inMemory?: boolean;
}

export function createDatabase(options: DatabaseOptions = {}): DatabaseSync {
  let db: DatabaseSync;
  if (options.inMemory || !options.filePath) {
    db = new DatabaseSync(":memory:");
  } else {
    const dir = path.dirname(options.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new DatabaseSync(options.filePath);
  }

  // Optimize SQLite configuration
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);

  initSchema(db);
  return db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      batch_id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      sdk_name TEXT NOT NULL,
      sdk_version TEXT NOT NULL,
      app_id TEXT NOT NULL,
      app_version TEXT NOT NULL,
      app_build TEXT NOT NULL,
      install_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      os_version TEXT NOT NULL,
      model TEXT NOT NULL,
      network_type TEXT NOT NULL,
      event_count INTEGER NOT NULL,
      raw_payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      play_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      t_mono_ms INTEGER NOT NULL,
      t_wall TEXT NOT NULL,
      data TEXT NOT NULL,
      UNIQUE (session_id, seq),
      FOREIGN KEY (batch_id) REFERENCES batches (batch_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_id, seq);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
    CREATE INDEX IF NOT EXISTS idx_events_t_wall ON events (t_wall);

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      content_id TEXT,
      stream_type TEXT,
      protocol TEXT,
      player_name TEXT,
      platform TEXT NOT NULL,
      app_version TEXT NOT NULL,
      network_type TEXT NOT NULL,
      device_model TEXT NOT NULL,
      first_event_at TEXT NOT NULL,
      last_event_at TEXT NOT NULL,
      has_first_frame INTEGER NOT NULL DEFAULT 0,
      startup_ms INTEGER,
      vsf INTEGER NOT NULL DEFAULT 0,
      ebvs INTEGER NOT NULL DEFAULT 0,
      rebuffer_ms INTEGER NOT NULL DEFAULT 0,
      rebuffer_count INTEGER NOT NULL DEFAULT 0,
      play_time_ms INTEGER NOT NULL DEFAULT 0,
      rebuffer_ratio REAL,
      rebuffer_bucket TEXT,
      dropped INTEGER NOT NULL DEFAULT 0,
      rendered INTEGER NOT NULL DEFAULT 0,
      dropped_frame_ratio REAL,
      dropped_frame_bucket TEXT,
      avg_bitrate_bps INTEGER,
      bitrate_switch_count INTEGER NOT NULL DEFAULT 0,
      playback_failure INTEGER NOT NULL DEFAULT 0,
      crash_or_anr INTEGER NOT NULL DEFAULT 0,
      app_health_kinds TEXT NOT NULL DEFAULT '[]',
      qoe REAL,
      clock_regression INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_time ON sessions (first_event_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_platform ON sessions (platform);
    CREATE INDEX IF NOT EXISTS idx_sessions_network ON sessions (network_type);
    CREATE INDEX IF NOT EXISTS idx_sessions_rebuffer_bucket ON sessions (rebuffer_bucket);
    CREATE INDEX IF NOT EXISTS idx_sessions_dropped_bucket ON sessions (dropped_frame_bucket);
    CREATE INDEX IF NOT EXISTS idx_sessions_qoe ON sessions (qoe);
  `);
}
