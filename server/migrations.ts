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
] as const;
