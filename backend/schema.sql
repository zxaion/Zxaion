-- Cloudflare D1 Schema & Indexes for ZXAION VERSE

CREATE TABLE IF NOT EXISTS images (
  id             TEXT PRIMARY KEY,
  r2_key         TEXT NOT NULL,
  bucket         TEXT NOT NULL,
  title          TEXT NOT NULL,
  category       TEXT NOT NULL,
  sub_category   TEXT,
  size           INTEGER DEFAULT 0,
  uploaded       TEXT,
  last_synced    TEXT,
  view_count     INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_images_bucket_cat_uploaded
  ON images (bucket, category, uploaded DESC);

CREATE INDEX IF NOT EXISTS idx_images_bucket_subcat
  ON images (bucket, sub_category);

CREATE INDEX IF NOT EXISTS idx_images_bucket_trending
  ON images (bucket, category, view_count DESC, download_count DESC, uploaded DESC);

CREATE TABLE IF NOT EXISTS user_credits (
  user_id       TEXT PRIMARY KEY,
  public_id     TEXT,
  credits       INTEGER NOT NULL DEFAULT 0,
  lifetime      INTEGER NOT NULL DEFAULT 0,
  recovery_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_credits_recovery
  ON user_credits (recovery_hash);

CREATE INDEX IF NOT EXISTS idx_user_credits_public_id
  ON user_credits (public_id);

CREATE TABLE IF NOT EXISTS purchased_images (
  user_id      TEXT NOT NULL,
  photo_id     TEXT NOT NULL,
  purchased_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, photo_id)
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  order_id      TEXT NOT NULL UNIQUE,
  capture_id    TEXT,
  pack_key      TEXT NOT NULL,
  amount        REAL NOT NULL,
  status        TEXT NOT NULL,
  error_message TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id
  ON payment_orders (order_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_capture_id
  ON payment_orders (capture_id);

CREATE TABLE IF NOT EXISTS views (
  photo_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (photo_id, user_id)
);

CREATE TABLE IF NOT EXISTS downloads (
  photo_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (photo_id, user_id)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id         TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 1,
  reset_time INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset
  ON rate_limits (reset_time);

-- ================================================================
-- Virtual Accounts, Sessions, Immutable Credit Ledger, Email & Backups
-- ================================================================

CREATE TABLE IF NOT EXISTS accounts (
  account_id            TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL UNIQUE,
  email                 TEXT UNIQUE,
  email_verified        INTEGER NOT NULL DEFAULT 0,
  password_hash         TEXT,
  display_name          TEXT,
  status                TEXT NOT NULL DEFAULT 'active',
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now')),
  last_login_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_accounts_email
  ON accounts (email);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON accounts (user_id);

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id   TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  user_agent   TEXT,
  ip_hash      TEXT,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  last_seen_at TEXT DEFAULT (datetime('now')),
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_account
  ON user_sessions (account_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash
  ON user_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions (expires_at);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  tx_type        TEXT NOT NULL,
  amount         INTEGER NOT NULL,
  balance_after  INTEGER NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id   TEXT NOT NULL,
  description    TEXT,
  metadata_json  TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_account_created
  ON credit_ledger (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON credit_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_verifications (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_lookup
  ON email_verifications (email, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_snapshots (
  snapshot_id  TEXT PRIMARY KEY,
  created_by   TEXT NOT NULL,
  accounts_cnt INTEGER NOT NULL DEFAULT 0,
  wallets_cnt  INTEGER NOT NULL DEFAULT 0,
  ledger_cnt   INTEGER NOT NULL DEFAULT 0,
  orders_cnt   INTEGER NOT NULL DEFAULT 0,
  checksum_sha TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);

