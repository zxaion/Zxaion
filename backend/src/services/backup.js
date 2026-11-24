// D1 Database Backup Snapshot & SHA-256 Verified Restore Service
import { generateOpaqueId, sha256Hex } from '../utils/userToken.js';

const BACKUP_CHUNK_SIZE = 100;

export async function buildBackupTables(DB) {
  const [accountsRes, creditsRes, purchasedRes, ordersRes, ledgerRes] = await Promise.all([
    DB.prepare('SELECT account_id, user_id, email, email_verified, password_hash, display_name, status, failed_login_attempts, locked_until, created_at, updated_at, last_login_at FROM accounts').all(),
    DB.prepare('SELECT user_id, public_id, credits, lifetime, recovery_hash FROM user_credits').all(),
    DB.prepare('SELECT user_id, photo_id, purchased_at FROM purchased_images').all(),
    DB.prepare('SELECT id, user_id, order_id, capture_id, pack_key, amount, status, error_message, created_at, completed_at FROM payment_orders').all(),
    DB.prepare('SELECT id, account_id, user_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at FROM credit_ledger').all(),
  ]);

  return {
    accounts:         accountsRes?.results || [],
    user_credits:     creditsRes?.results || [],
    purchased_images: purchasedRes?.results || [],
    payment_orders:   ordersRes?.results || [],
    credit_ledger:    ledgerRes?.results || [],
  };
}

export async function createD1Snapshot(env, createdBy = 'admin') {
  const DB = env?.DB;
  if (!DB) throw new Error('D1 database not configured');

  const snapshotId  = generateOpaqueId('snap');
  const createdAt   = new Date().toISOString();
  const tables      = await buildBackupTables(DB);
  const checksumSha = await sha256Hex(JSON.stringify(tables));

  const payload = {
    version: 1,
    snapshot_id: snapshotId,
    created_by: createdBy,
    created_at: createdAt,
    checksum_sha: checksumSha,
    counts: {
      accounts:         tables.accounts.length,
      user_credits:     tables.user_credits.length,
      purchased_images: tables.purchased_images.length,
      payment_orders:   tables.payment_orders.length,
      credit_ledger:    tables.credit_ledger.length,
    },
    tables,
  };

  const payloadJson = JSON.stringify(payload);

  await DB.prepare(`
    INSERT INTO backup_snapshots
      (snapshot_id, created_by, accounts_cnt, wallets_cnt, ledger_cnt, orders_cnt, checksum_sha, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    snapshotId,
    createdBy,
    tables.accounts.length,
    tables.user_credits.length,
    tables.credit_ledger.length,
    tables.payment_orders.length,
    checksumSha,
    payloadJson,
    createdAt
  ).run();

  // Mirror durable snapshot to private _backups/ prefix in main R2 bucket (blocked from public /api/img/)
  let r2BackedUp = false;
  if (env?.Zxaion_B && typeof env.Zxaion_B.put === 'function') {
    try {
      await env.Zxaion_B.put(`_backups/${snapshotId}.json`, payloadJson, {
        contentType: 'application/json',
      });
      await env.Zxaion_B.put('_backups/d1-latest.json', payloadJson, {
        contentType: 'application/json',
      });
      r2BackedUp = true;
    } catch (err) {
      console.warn('[Backup] R2 mirror backup skipped:', err.message);
    }
  }

  return {
    snapshot_id:  snapshotId,
    created_by:   createdBy,
    created_at:   createdAt,
    checksum_sha: checksumSha,
    counts:       payload.counts,
    r2_backed_up: r2BackedUp,
  };
}

export async function listBackupSnapshots(DB, limit = 25) {
  const res = await DB.prepare(
    'SELECT snapshot_id, created_by, accounts_cnt, wallets_cnt, ledger_cnt, orders_cnt, checksum_sha, created_at FROM backup_snapshots ORDER BY created_at DESC LIMIT ?'
  ).bind(limit).all();
  return res?.results || [];
}

export async function getBackupSnapshot(DB, snapshotId) {
  return await DB.prepare(
    'SELECT snapshot_id, created_by, accounts_cnt, wallets_cnt, ledger_cnt, orders_cnt, checksum_sha, payload_json, created_at FROM backup_snapshots WHERE snapshot_id = ? LIMIT 1'
  ).bind(snapshotId).first();
}

export async function restoreFromSnapshot(DB, snapshotInput) {
  const payload = typeof snapshotInput === 'string' ? JSON.parse(snapshotInput) : snapshotInput;
  if (!payload || typeof payload !== 'object' || !payload.tables || typeof payload.tables !== 'object') {
    throw new Error('Invalid snapshot structure: missing tables');
  }

  const tables = payload.tables;
  const requiredKeys = ['accounts', 'user_credits', 'purchased_images', 'payment_orders', 'credit_ledger'];
  for (const key of requiredKeys) {
    if (!Array.isArray(tables[key])) {
      throw new Error(`Invalid snapshot structure: tables.${key} must be an array`);
    }
  }

  if (!payload.checksum_sha) {
    throw new Error('Snapshot integrity checksum is missing');
  }

  const normalizedTables = {
    accounts:         tables.accounts,
    user_credits:     tables.user_credits,
    purchased_images: tables.purchased_images,
    payment_orders:   tables.payment_orders,
    credit_ledger:    tables.credit_ledger,
  };
  const actualChecksum = await sha256Hex(JSON.stringify(normalizedTables));
  if (actualChecksum !== payload.checksum_sha) {
    throw new Error('Snapshot checksum mismatch: payload integrity check failed');
  }

  const stmts = [];

  for (const acc of tables.accounts) {
    stmts.push(
      DB.prepare(`
        INSERT OR REPLACE INTO accounts
          (account_id, user_id, email, email_verified, password_hash, display_name, status, failed_login_attempts, locked_until, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        acc.account_id,
        acc.user_id,
        acc.email || null,
        acc.email_verified ? 1 : 0,
        acc.password_hash || null,
        acc.display_name || null,
        acc.status || 'active',
        Number(acc.failed_login_attempts) || 0,
        acc.locked_until || null,
        acc.created_at || new Date().toISOString(),
        acc.updated_at || new Date().toISOString(),
        acc.last_login_at || null
      )
    );
  }

  for (const uc of tables.user_credits) {
    stmts.push(
      DB.prepare(`
        INSERT OR REPLACE INTO user_credits (user_id, public_id, credits, lifetime, recovery_hash)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        uc.user_id,
        uc.public_id || null,
        Number(uc.credits) || 0,
        uc.lifetime ? 1 : 0,
        uc.recovery_hash || null
      )
    );
  }

  for (const p of tables.purchased_images) {
    stmts.push(
      DB.prepare(`
        INSERT OR IGNORE INTO purchased_images (user_id, photo_id, purchased_at)
        VALUES (?, ?, ?)
      `).bind(p.user_id, p.photo_id, p.purchased_at || new Date().toISOString())
    );
  }

  for (const ord of tables.payment_orders) {
    stmts.push(
      DB.prepare(`
        INSERT OR REPLACE INTO payment_orders
          (id, user_id, order_id, capture_id, pack_key, amount, status, error_message, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        ord.id,
        ord.user_id,
        ord.order_id,
        ord.capture_id || null,
        ord.pack_key,
        Number(ord.amount) || 0,
        ord.status,
        ord.error_message || null,
        ord.created_at || new Date().toISOString(),
        ord.completed_at || null
      )
    );
  }

  for (const led of tables.credit_ledger) {
    stmts.push(
      DB.prepare(`
        INSERT OR IGNORE INTO credit_ledger
          (id, account_id, user_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        led.id,
        led.account_id,
        led.user_id,
        led.tx_type,
        Number(led.amount) || 0,
        Number(led.balance_after) || 0,
        led.reference_type,
        led.reference_id,
        led.description || '',
        led.metadata_json || null,
        led.created_at || new Date().toISOString()
      )
    );
  }

  for (let i = 0; i < stmts.length; i += BACKUP_CHUNK_SIZE) {
    await DB.batch(stmts.slice(i, i + BACKUP_CHUNK_SIZE));
  }

  return {
    restored: true,
    checksum_sha: actualChecksum,
    counts: {
      accounts:         tables.accounts.length,
      user_credits:     tables.user_credits.length,
      purchased_images: tables.purchased_images.length,
      payment_orders:   tables.payment_orders.length,
      credit_ledger:    tables.credit_ledger.length,
    },
  };
}
