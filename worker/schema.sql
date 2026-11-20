-- Kahanio feedback (D1). Apply once: npx.cmd wrangler d1 execute kahanio-feedback --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '{}',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_created ON feedback (created_at);
