-- D1 migration: contact submissions table (§7)
CREATE TABLE IF NOT EXISTS contact_submissions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  topic      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
