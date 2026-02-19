CREATE TABLE IF NOT EXISTS tokens (
  cache_key TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
