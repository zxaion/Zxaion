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

CREATE TABLE IF NOT EXISTS user_credits (
  user_id       TEXT PRIMARY KEY,
  credits       INTEGER NOT NULL DEFAULT 0,
  lifetime      INTEGER NOT NULL DEFAULT 0,
  recovery_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_credits_recovery
  ON user_credits (recovery_hash);

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
  pack_key      TEXT NOT NULL,
  amount        REAL NOT NULL,
  status        TEXT NOT NULL,
  error_message TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id
  ON payment_orders (order_id);

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
