import { handleScheduled, resolveBucketTarget, buildUpsertStatement } from '../services/r2Sync.js';
import {
  createD1Snapshot,
  getBackupSnapshot,
  listBackupSnapshots,
  restoreFromSnapshot,
} from '../services/backup.js';
import {
  parseImageMeta,
  extractImageDimensions,
  decodeBase64DataUrl,
  buildWatermarkedPreviewSvg,
} from '../services/imageMeta.js';
import { appendCreditLedgerStatement, ensureAutoAccount } from '../services/accountAuth.js';
import { derivePublicPayerRef } from '../utils/userToken.js';
import { jsonResponse } from '../utils/cors.js';

function unauthorizedAdmin(corsHeaders) {
  return jsonResponse({ error: 'Unauthorized: Invalid admin token' }, 401, corsHeaders);
}

// ================================================================
// Helper: Extract & Validate Admin Secret Token
// Supports: X-Admin-Token header, Authorization: Bearer <token>, ?token=...
// ================================================================
export function validateAdminAuth(request, env) {
  const configured = env.ADMIN_TOKEN || process.env.ADMIN_TOKEN || 'local-dev-admin';
  if (!configured) return false;

  const headerToken = request.headers.get('X-Admin-Token');
  if (headerToken && headerToken === configured) return true;

  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer === configured) return true;
  }

  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken && queryToken === configured) return true;
  } catch {}

  return false;
}

// ================================================================
// ENDPOINT: Manual R2 Sync / Force-Rescan Trigger (POST /api/admin/rescan)
// ================================================================
export async function handleAdminRescan({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) return unauthorizedAdmin(corsHeaders);

  try {
    const stats = await handleScheduled(env);
    return jsonResponse({
      success: true,
      message: 'R2 Force Rescan and Catalog Sync completed successfully',
      stats,
    }, 200, corsHeaders);
  } catch (e) {
    console.error('[Admin] Rescan failed:', e);
    return jsonResponse({ success: false, error: e.message || 'Rescan failed' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Complete Admin Dashboard Data (GET /api/admin/dashboard)
// Total revenue, PayPal orders breakdown, active credit users,
// recovery codes, and catalog synchronization metrics.
// ================================================================
export async function handleAdminDashboard({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) return unauthorizedAdmin(corsHeaders);

  try {
    // 1. Fetch Orders from D1
    const ordersRes = await env.DB.prepare(
      'SELECT id, user_id, order_id, capture_id, pack_key, amount, status, error_message, created_at, completed_at FROM payment_orders ORDER BY created_at DESC LIMIT ?'
    ).bind(250).all();
    const orders = ordersRes.results || [];

    // Compute Revenue & Order KPIs
    let totalGross = 0;
    let completedOrders = 0;
    let failedOrders = 0;
    let processingOrders = 0;
    let refundedOrders = 0;
    const packBreakdown = {};

    for (const ord of orders) {
      const amt = Number(ord.amount) || 0;
      const status = ord.status || 'unknown';
      if (status === 'completed') {
        totalGross += amt;
        completedOrders++;
        const pKey = ord.pack_key || 'other';
        packBreakdown[pKey] = (packBreakdown[pKey] || 0) + 1;
      } else if (status === 'failed') {
        failedOrders++;
      } else if (status === 'processing' || status === 'created') {
        processingOrders++;
      } else if (['refunded', 'reversed', 'disputed'].includes(status)) {
        refundedOrders++;
      }
    }

    // 2. Fetch Users from D1
    const usersRes = await env.DB.prepare(
      'SELECT user_id, public_id, credits, lifetime, recovery_hash FROM user_credits ORDER BY credits DESC LIMIT ?'
    ).bind(250).all();
    const rawUsers = usersRes.results || [];

    // Fetch purchased images counts
    let purchasedMap = {};
    try {
      const pRes = await env.DB.prepare('SELECT user_id, COUNT(*) as count FROM purchased_images GROUP BY user_id').all();
      if (pRes && Array.isArray(pRes.results)) {
        for (const r of pRes.results) purchasedMap[r.user_id] = r.count;
      }
    } catch {}

    let totalCreditsCirculating = 0;
    let totalLifetimeUsers = 0;
    let totalRecoveryCodes = 0;

    const users = rawUsers.map((u) => {
      const credits = Number(u.credits) || 0;
      const lifetime = Boolean(u.lifetime);
      const hasRecovery = Boolean(u.recovery_hash);
      totalCreditsCirculating += credits;
      if (lifetime) totalLifetimeUsers++;
      if (hasRecovery) totalRecoveryCodes++;

      return {
        user_id: u.user_id,
        public_id: u.public_id || null,
        credits,
        lifetime,
        has_recovery: hasRecovery,
        purchased_count: purchasedMap[u.user_id] || 0,
      };
    });

    // 3. Catalog breakdown
    let catalogCounts = { main: 0, comitbase: 0, dtreasure: 0 };
    try {
      const [m, c, d] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as total FROM images WHERE bucket = 'main'").first(),
        env.DB.prepare("SELECT COUNT(*) as total FROM images WHERE bucket = 'comitbase'").first(),
        env.DB.prepare("SELECT COUNT(*) as total FROM images WHERE bucket = 'dtreasure'").first(),
      ]);
      catalogCounts = {
        main: m?.total || 0,
        comitbase: c?.total || 0,
        dtreasure: d?.total || 0,
      };
    } catch {}

    // 4. Virtual Accounts, Credit Ledger & Backup Snapshots
    let accounts = [];
    let ledger = [];
    let snapshots = [];
    let verifiedEmails = 0;
    let passwordProtected = 0;

    try {
      const accRes = await env.DB.prepare(
        'SELECT account_id, user_id, email, email_verified, password_hash, display_name, status, created_at, last_login_at FROM accounts ORDER BY created_at DESC LIMIT ?'
      ).bind(250).all();
      accounts = (accRes?.results || []).map((a) => {
        const emailVerified = Boolean(a.email_verified);
        const hasPassword = Boolean(a.has_password !== undefined ? a.has_password : a.password_hash);
        if (emailVerified) verifiedEmails++;
        if (hasPassword) passwordProtected++;
        return {
          account_id: a.account_id,
          user_id: a.user_id,
          email: a.email || null,
          email_verified: emailVerified,
          has_password: hasPassword,
          display_name: a.display_name || null,
          status: a.status || 'active',
          created_at: a.created_at || null,
          last_login_at: a.last_login_at || null,
        };
      });
    } catch {}

    try {
      const ledRes = await env.DB.prepare(
        'SELECT id, account_id, user_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at FROM credit_ledger ORDER BY created_at DESC LIMIT ?'
      ).bind(100).all();
      ledger = ledRes?.results || [];
    } catch {}

    try {
      snapshots = await listBackupSnapshots(env.DB, 15);
    } catch {}

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        revenue: {
          totalGross: Number(totalGross.toFixed(2)),
          completedOrders,
          failedOrders,
          processingOrders,
          refundedOrders,
          totalOrders: orders.length,
          packBreakdown,
        },
        usersSummary: {
          totalUsers: users.length,
          totalCreditsCirculating,
          totalLifetimeUsers,
          totalRecoveryCodes,
        },
        accountsSummary: {
          totalAccounts: accounts.length,
          verifiedEmails,
          passwordProtected,
          totalLedgerEntries: ledger.length,
        },
        catalog: catalogCounts,
      },
      orders,
      users,
      accounts,
      ledger,
      snapshots,
    }, 200, corsHeaders);
  } catch (err) {
    console.error('[Admin] Dashboard error:', err);
    return jsonResponse({ success: false, error: err.message || 'Internal error' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINTS: Database Backup Snapshots & Verified Restore (/api/admin/backup*)
// ================================================================
export async function handleAdminBackupList({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) return unauthorizedAdmin(corsHeaders);

  try {
    const snapshots = await listBackupSnapshots(env.DB, 25);
    return jsonResponse({ success: true, snapshots }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
  }
}

export async function handleAdminBackupCreate({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) return unauthorizedAdmin(corsHeaders);

  try {
    const snapshot = await createD1Snapshot(env, 'admin-manual');
    return jsonResponse({ success: true, snapshot }, 201, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[Admin] Backup snapshot error:', err);
    return jsonResponse({ success: false, error: err.message || 'Snapshot failed' }, 500, corsHeaders);
  }
}

export async function handleAdminBackupDownload({ request, url, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) return unauthorizedAdmin(corsHeaders);

  try {
    let snapshotId = (url.searchParams.get('id') || '').trim();
    if (!snapshotId) {
      const list = await listBackupSnapshots(env.DB, 1);
      snapshotId = list[0]?.snapshot_id || '';
    }
    if (!snapshotId) {
      const created = await createD1Snapshot(env, 'admin-download');
      snapshotId = created.snapshot_id;
    }

    const row = await getBackupSnapshot(env.DB, snapshotId);
    if (!row) {
      return jsonResponse({ success: false, error: 'Snapshot not found' }, 404, corsHeaders);
    }

    return new Response(row.payload_json, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="zxaion-d1-backup-${row.snapshot_id}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || 'Download failed' }, 500, corsHeaders);
  }
}

export async function handleAdminBackupRestore({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) return unauthorizedAdmin(corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  try {
    let snapshotPayload = body?.snapshot || (body?.tables ? body : null);
    if (!snapshotPayload && body?.snapshotId) {
      const row = await getBackupSnapshot(env.DB, String(body.snapshotId).trim());
      if (!row) {
        return jsonResponse({ success: false, error: 'Snapshot not found' }, 404, corsHeaders);
      }
      snapshotPayload = JSON.parse(row.payload_json);
    }

    if (!snapshotPayload) {
      return jsonResponse({ success: false, error: 'Provide snapshotId or snapshot JSON payload' }, 400, corsHeaders);
    }

    const result = await restoreFromSnapshot(env.DB, snapshotPayload);
    return jsonResponse({ success: true, ...result }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[Admin] Restore error:', err);
    return jsonResponse({ success: false, error: err.message || 'Restore failed' }, 400, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Admin User Credit & VIP Management (POST /api/admin/credits)
// ================================================================
export async function handleAdminAdjustCredits({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) return unauthorizedAdmin(corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const userId = String(body?.userId || '').trim();
  const mode = String(body?.mode || 'add').trim().toLowerCase();
  const reason = String(body?.reason || '').trim().slice(0, 140) || 'Admin wallet adjustment';
  if (!userId || userId === 'anonymous') {
    return jsonResponse({ success: false, error: 'Valid userId is required' }, 400, corsHeaders);
  }
  if (!['add', 'set', 'lifetime'].includes(mode)) {
    return jsonResponse({ success: false, error: 'Unsupported credit adjustment mode' }, 400, corsHeaders);
  }

  try {
    const publicId = await derivePublicPayerRef(userId);
    const { account } = await ensureAutoAccount(env.DB, { userId, request, issueSession: false });
    const existing = await env.DB.prepare(
      'SELECT credits, lifetime, recovery_hash FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    const prevCredits = Number(existing?.credits || 0);
    const prevLifetime = !!existing?.lifetime;

    let nextCredits = prevCredits;
    let nextLifetime = prevLifetime;
    let delta = 0;

    if (mode === 'add') {
      const amount = Math.round(Number(body?.amount));
      if (!Number.isFinite(amount) || amount === 0) {
        return jsonResponse({ success: false, error: 'Provide a non-zero integer credit delta' }, 400, corsHeaders);
      }
      nextCredits = Math.max(0, prevCredits + amount);
      delta = nextCredits - prevCredits;
    } else if (mode === 'set') {
      const targetBalance = Math.round(Number(body?.amount));
      if (!Number.isFinite(targetBalance) || targetBalance < 0) {
        return jsonResponse({ success: false, error: 'Balance must be a non-negative integer' }, 400, corsHeaders);
      }
      nextCredits = targetBalance;
      delta = nextCredits - prevCredits;
    } else if (mode === 'lifetime') {
      nextLifetime = Boolean(body?.lifetime);
      if (body?.amount !== undefined && body?.amount !== null && body?.amount !== '') {
        const bonus = Math.round(Number(body.amount));
        if (Number.isFinite(bonus) && bonus !== 0) {
          nextCredits = Math.max(0, prevCredits + bonus);
          delta = nextCredits - prevCredits;
        }
      }
    }

    const nowIso = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        'UPDATE user_credits SET credits = ?, public_id = COALESCE(public_id, ?) WHERE user_id = ?'
      ).bind(nextCredits, publicId, userId),
    ];

    if (nextLifetime !== prevLifetime) {
      if (nextLifetime) {
        statements.push(
          env.DB.prepare(`
            INSERT INTO user_credits (user_id, public_id, credits, lifetime)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(user_id) DO UPDATE SET lifetime = 1, public_id = COALESCE(user_credits.public_id, excluded.public_id)
          `).bind(userId, publicId, nextCredits)
        );
      } else {
        statements.push(
          env.DB.prepare('UPDATE user_credits SET lifetime = 0 WHERE user_id = ?').bind(userId)
        );
      }
    }

    statements.push(
      appendCreditLedgerStatement(env.DB, {
        accountId: account?.account_id || 'admin-adjust',
        userId,
        txType: 'admin_adjust',
        amount: delta,
        referenceType: 'admin_console',
        referenceId: `adj_${Date.now()}`,
        description: mode === 'lifetime'
          ? `${reason} (VIP Lifetime: ${nextLifetime ? 'Enabled' : 'Disabled'})`
          : reason,
        metadata: { mode, prevCredits, nextCredits, prevLifetime, nextLifetime },
        createdAt: nowIso,
      })
    );

    await env.DB.batch(statements);

    return jsonResponse({
      success: true,
      user: {
        user_id: userId,
        public_id: publicId,
        credits: nextCredits,
        lifetime: nextLifetime,
        has_recovery: Boolean(existing?.recovery_hash),
      },
      wallet: {
        credits: nextCredits,
        lifetime: nextLifetime,
      },
    }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[Admin] Adjust credits error:', err.message);
    return jsonResponse({ success: false, error: err.message || 'Failed to adjust credits' }, 500, corsHeaders);
  }
}

// ================================================================
// ENDPOINT: Admin Direct Media Upload (POST /api/admin/upload)
// Supports main / comitbase / dtreasure + auto watermarked _preview/<key> for dtreasure
// ================================================================
function sanitizePathSegment(raw, fallback = '') {
  return String(raw || '')
    .trim()
    .replace(/\.\./g, '')
    .replace(/[\\/\0<>:"|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48) || fallback;
}

export async function handleAdminUpload({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) return unauthorizedAdmin(corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const bucketInput = String(body?.bucket || 'main').trim().toLowerCase();
  const target = resolveBucketTarget(bucketInput, env);
  if (!target || !target.bucket) {
    return jsonResponse({ success: false, error: 'Invalid or unconfigured target bucket' }, 400, corsHeaders);
  }

  const decoded = decodeBase64DataUrl(body?.imageData, { maxBytes: 8 * 1024 * 1024 });
  if (decoded.error) {
    return jsonResponse({ success: false, error: decoded.error }, decoded.status || 400, corsHeaders);
  }

  const rawTitle = String(body?.title || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (rawTitle.length < 2) {
    return jsonResponse({ success: false, error: 'Please provide an artwork title (at least 2 characters).' }, 400, corsHeaders);
  }

  const slug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'artwork';
  const fileName = `${slug}_${Date.now()}.${decoded.ext}`;

  let r2Key = '';
  let categoryLabel = '';
  if (target.name === 'main') {
    const folder = sanitizePathSegment(body?.category || 'ANIME', 'ANIME').toUpperCase();
    const sub = sanitizePathSegment(body?.subCategory || '', '');
    r2Key = sub ? `${folder}/${sub}/${fileName}` : `${folder}/${fileName}`;
    categoryLabel = folder;
  } else if (target.name === 'comitbase') {
    const folder = sanitizePathSegment(body?.category || 'community', 'community').toLowerCase();
    r2Key = `${folder}/${fileName}`;
    categoryLabel = 'COMITBASE';
  } else {
    const folder = sanitizePathSegment(body?.category || 'vault', 'vault').toLowerCase();
    r2Key = `${folder}/${fileName}`;
    categoryLabel = 'DTREASURE';
  }

  const uploadedIso = new Date().toISOString();
  const dims = extractImageDimensions(decoded.bytes, decoded.mimeType);
  const uploader = body?.uploader ? String(body.uploader).trim().slice(0, 60) : 'Admin';

  try {
    await target.bucket.put(r2Key, decoded.bytes, {
      contentType: decoded.mimeType,
      size: decoded.bytes.byteLength,
      uploaded: uploadedIso,
    });

    let watermarkPreviewKey = null;
    if (target.name === 'dtreasure') {
      watermarkPreviewKey = `_preview/${r2Key}`;
      const previewSvg = buildWatermarkedPreviewSvg({
        title: rawTitle,
        category: 'DTREASURE',
        previewDataUri: decoded.ext === 'svg' ? '' : String(body?.previewDataUri || body?.imageData || ''),
        width: dims.width || 480,
        height: dims.height || 640,
      });
      await target.bucket.put(watermarkPreviewKey, previewSvg, {
        contentType: 'image/svg+xml',
        size: previewSvg.length,
        uploaded: uploadedIso,
      });
    }

    const parsed = parseImageMeta(r2Key, target.name) || {
      id: `${target.name}:${r2Key}`,
      r2_key: r2Key,
      bucket: target.name,
      title: rawTitle,
      category: categoryLabel,
      sub_category: null,
      url: target.name === 'dtreasure'
        ? `/api/dtreasure/img/${encodeURIComponent(r2Key)}`
        : target.name === 'comitbase'
          ? `/api/comitbase/img/${encodeURIComponent(r2Key)}`
          : `/api/img/${encodeURIComponent(r2Key)}`,
    };
    const meta = { ...parsed, title: rawTitle };

    await buildUpsertStatement(env.DB, meta, decoded.bytes.byteLength, uploadedIso, uploadedIso, {
      width: dims.width,
      height: dims.height,
      uploader,
    }).run();

    return jsonResponse({
      success: true,
      watermarkPreviewKey,
      photo: {
        id: meta.id,
        bucket: target.name,
        r2Key,
        title: rawTitle,
        category: meta.category,
        subCategory: meta.sub_category,
        url: meta.url,
        width: dims.width,
        height: dims.height,
        size: decoded.bytes.byteLength,
        uploaded: uploadedIso,
      },
    }, 201, corsHeaders, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[Admin] Direct upload error:', err.message);
    return jsonResponse({ success: false, error: err.message || 'Upload failed' }, 500, corsHeaders);
  }
}
