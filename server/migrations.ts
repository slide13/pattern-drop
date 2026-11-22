export const MIGRATIONS = [
  `CREATE TABLE transfer_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    status TEXT DEFAULT 'waiting' NOT NULL,
    object_key TEXT,
    width INTEGER,
    height INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  "CREATE INDEX idx_transfer_sessions_updated_at ON transfer_sessions(updated_at)",
  `CREATE TABLE session_images (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    object_key TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
  CREATE INDEX idx_session_images_session_created ON session_images(session_id, created_at)`,
  "DROP TABLE transfer_sessions",
  // Sessions are registered by the computer that shows the QR code, so a phone can
  // tell a real session from a mistyped or stale link.
  `CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
  INSERT INTO sessions (id) SELECT DISTINCT session_id FROM session_images`,
  // Unused sessions expire; existing ones count as last seen at their latest upload.
  `ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
  UPDATE sessions SET last_seen_at = COALESCE(
    (SELECT MAX(created_at) FROM session_images WHERE session_id = sessions.id),
    created_at
  );
  CREATE INDEX idx_sessions_last_seen ON sessions(last_seen_at)`,
] as const;
