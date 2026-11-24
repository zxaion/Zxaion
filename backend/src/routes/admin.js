import { handleScheduled } from '../services/r2Sync.js';
import {
  createD1Snapshot,
  getBackupSnapshot,
  listBackupSnapshots,
  restoreFromSnapshot,
} from '../services/backup.js';

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
  if (!validateAdminAuth(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid admin token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const stats = await handleScheduled(env);
    return new Response(JSON.stringify({
      success: true,
      message: 'R2 Force Rescan and Catalog Sync completed successfully',
      stats,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[Admin] Rescan failed:', e);
    return new Response(JSON.stringify({ success: false, error: e.message || 'Rescan failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Backward-compatible alias
export const handleAdminSync = handleAdminRescan;

// ================================================================
// ENDPOINT: Complete Admin Dashboard Data (GET /api/admin/dashboard)
// Total revenue, PayPal orders breakdown, active credit users,
// recovery codes, and catalog synchronization metrics.
// ================================================================
export async function handleAdminDashboard({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid admin token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

    return new Response(JSON.stringify({
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
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Admin] Dashboard error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINTS: Database Backup Snapshots & Verified Restore (/api/admin/backup*)
// ================================================================
export async function handleAdminBackupList({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid admin token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const snapshots = await listBackupSnapshots(env.DB, 25);
    return new Response(JSON.stringify({ success: true, snapshots }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function handleAdminBackupCreate({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid admin token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const snapshot = await createD1Snapshot(env, 'admin-manual');
    return new Response(JSON.stringify({ success: true, snapshot }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[Admin] Backup snapshot error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Snapshot failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function handleAdminBackupDownload({ request, url, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid admin token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
      return new Response(JSON.stringify({ success: false, error: 'Snapshot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
    return new Response(JSON.stringify({ success: false, error: err.message || 'Download failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function handleAdminBackupRestore({ request, env, corsHeaders }) {
  if (!validateAdminAuth(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid admin token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    let snapshotPayload = body?.snapshot || (body?.tables ? body : null);
    if (!snapshotPayload && body?.snapshotId) {
      const row = await getBackupSnapshot(env.DB, String(body.snapshotId).trim());
      if (!row) {
        return new Response(JSON.stringify({ success: false, error: 'Snapshot not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      snapshotPayload = JSON.parse(row.payload_json);
    }

    if (!snapshotPayload) {
      return new Response(JSON.stringify({ success: false, error: 'Provide snapshotId or snapshot JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await restoreFromSnapshot(env.DB, snapshotPayload);
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[Admin] Restore error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Restore failed' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
