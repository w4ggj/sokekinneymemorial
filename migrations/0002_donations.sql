-- D1 migration: donations ledger (§7)
CREATE TABLE IF NOT EXISTS donations (
  id                  TEXT PRIMARY KEY,
  stripe_event_id     TEXT UNIQUE NOT NULL,
  stripe_customer_id  TEXT,
  amount_intended     INTEGER NOT NULL,
  amount_charged      INTEGER NOT NULL,
  fee_covered         INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'usd',
  frequency           TEXT NOT NULL,
  donor_name          TEXT,
  donor_email         TEXT,
  employer            TEXT,
  dedication          TEXT,
  public_recognition  INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL,
  created_at          TEXT NOT NULL
);
