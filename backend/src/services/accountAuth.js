// Virtual Account, Session Management, and Immutable Credit Ledger Helpers
import {
  derivePublicPayerRef,
  generateAccountId,
  generateOpaqueId,
  generateSessionToken,
  isAccountIdFormat,
  sha256Hex,
} from '../utils/userToken.js';

export const SESSION_COOKIE_NAME = 'zx_sid';
const SESSION_TTL_DAYS = 30;

export const ACCOUNT_SELECT_COLUMNS =
  'account_id, user_id, email, email_verified, password_hash, display_name, status, failed_login_attempts, locked_until, created_at, updated_at, last_login_at';
export const LEDGER_SELECT_COLUMNS =
  'id, account_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at';
export const ORDER_SELECT_COLUMNS =
  'id, order_id, capture_id, pack_key, amount, status, created_at, completed_at';

export async function getAccountById(DB, accountId) {
  return DB.prepare(`SELECT ${ACCOUNT_SELECT_COLUMNS} FROM accounts WHERE account_id = ? LIMIT 1`).bind(accountId).first();
}

export async function getAccountByUserId(DB, userId) {
  return DB.prepare(`SELECT ${ACCOUNT_SELECT_COLUMNS} FROM accounts WHERE user_id = ? LIMIT 1`).bind(userId).first();
}

export async function getAccountByEmail(DB, email) {
  return DB.prepare(`SELECT ${ACCOUNT_SELECT_COLUMNS} FROM accounts WHERE email = ? LIMIT 1`).bind(email).first();
}

export function parseCookies(request) {
  const header = request?.headers?.get?.('Cookie') || '';
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const val  = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(val);
    } catch {
      cookies[name] = val;
    }
  }
  return cookies;
}

export function buildSessionCookie(sessionToken, request, maxAgeSec = SESSION_TTL_DAYS * 24 * 3600) {
  let isHttps = true;
  try {
    const url = new URL(request.url);
    isHttps = url.protocol === 'https:';
  } catch {
    isHttps = true;
  }
  const encoded = encodeURIComponent(sessionToken);
  if (isHttps) {
    return `${SESSION_COOKIE_NAME}=${encoded}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=None; Secure; Partitioned`;
  }
  return `${SESSION_COOKIE_NAME}=${encoded}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}

export function clearSessionCookie(request) {
  return buildSessionCookie('', request, 0);
}

export function extractSessionToken(request) {
  const xSession = (request?.headers?.get?.('X-Session-Token') || '').trim();
  if (xSession) return xSession;

  const authHeader = (request?.headers?.get?.('Authorization') || '').trim();
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer && bearer.startsWith('zxs_')) return bearer;
    if (bearer && isAccountIdFormat(bearer)) return bearer;
  }

  const cookies = parseCookies(request);
  if (cookies[SESSION_COOKIE_NAME]) {
    return String(cookies[SESSION_COOKIE_NAME]).trim();
  }
  return null;
}

export function sanitizeAccountView(account) {
  if (!account) return null;
  return {
    accountId:     account.account_id,
    email:         account.email || null,
    emailVerified: !!account.email_verified,
    hasPassword:   !!account.password_hash,
    displayName:   account.display_name || null,
    status:        account.status || 'active',
    createdAt:     account.created_at || null,
    lastLoginAt:   account.last_login_at || null,
  };
}

export async function resolveSessionAuth({ request, DB, getUserToken }) {
  const sessionToken = extractSessionToken(request);

  if (sessionToken) {
    if (isAccountIdFormat(sessionToken)) {
      return {
        authenticated: false,
        reason: 'account_id_forbidden',
        userId: 'anonymous',
        accountId: null,
        account: null,
        session: null,
      };
    }

    const tokenHash = await sha256Hex(sessionToken);
    const sessionRow = await DB.prepare(
      'SELECT session_id, account_id, expires_at, revoked_at, last_seen_at, created_at FROM user_sessions WHERE token_hash = ? LIMIT 1'
    ).bind(tokenHash).first();

    if (sessionRow) {
      const nowIso = new Date().toISOString();
      const expired = sessionRow.expires_at && sessionRow.expires_at <= nowIso;
      if (!sessionRow.revoked_at && !expired) {
        const account = await getAccountById(DB, sessionRow.account_id);

        if (account && account.status === 'active') {
          try {
            await DB.prepare(
              'UPDATE user_sessions SET last_seen_at = ? WHERE session_id = ?'
            ).bind(nowIso, sessionRow.session_id).run();
          } catch {}

          return {
            authenticated: true,
            via: 'session',
            userId: account.user_id,
            accountId: account.account_id,
            account,
            session: sessionRow,
          };
        }
      }
    }

    // If caller explicitly sent a session header (not just a stale cookie), reject immediately
    const hasExplicitHeader = !!(
      request?.headers?.get?.('X-Session-Token') ||
      (request?.headers?.get?.('Authorization') || '').startsWith('Bearer zxs_')
    );
    if (hasExplicitHeader) {
      return {
        authenticated: false,
        reason: 'invalid_session',
        userId: 'anonymous',
        accountId: null,
        account: null,
        session: null,
      };
    }
  }

  // Fallback to device X-User-Token ONLY when the account is NOT password-protected
  const userId = typeof getUserToken === 'function' ? getUserToken(request) : 'anonymous';
  if (!userId || userId === 'anonymous') {
    return {
      authenticated: false,
      reason: 'anonymous',
      userId: 'anonymous',
      accountId: null,
      account: null,
      session: null,
    };
  }

  const account = await getAccountByUserId(DB, userId);

  if (account && account.password_hash) {
    // Registered account MUST present a valid session — device token alone is blocked
    return {
      authenticated: false,
      requiresLogin: true,
      reason: 'session_required',
      userId: 'anonymous',
      accountId: null,
      account: null,
      session: null,
    };
  }

  if (account && account.status && account.status !== 'active') {
    return {
      authenticated: false,
      reason: 'account_suspended',
      userId: 'anonymous',
      accountId: null,
      account: null,
      session: null,
    };
  }

  return {
    authenticated: true,
    via: 'guest_token',
    userId,
    accountId: account?.account_id || null,
    account: account || null,
    session: null,
  };
}

export async function createUserSession(DB, accountId, request, ttlDays = SESSION_TTL_DAYS) {
  const sessionToken = generateSessionToken();
  const tokenHash    = await sha256Hex(sessionToken);
  const sessionId    = generateOpaqueId('sess');
  const nowIso       = new Date().toISOString();
  const expiresAt    = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const rawUa   = (request?.headers?.get?.('User-Agent') || 'Unknown Device').trim().slice(0, 180);
  const rawIp   = (request?.headers?.get?.('CF-Connecting-IP') || request?.headers?.get?.('X-Forwarded-For') || '').split(',')[0].trim();
  const ipHash  = rawIp ? (await sha256Hex(rawIp)).slice(0, 16) : null;

  await DB.prepare(`
    INSERT INTO user_sessions (session_id, account_id, token_hash, user_agent, ip_hash, expires_at, revoked_at, last_seen_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).bind(sessionId, accountId, tokenHash, rawUa, ipHash, expiresAt, nowIso, nowIso).run();

  return { sessionId, sessionToken, expiresAt, userAgent: rawUa };
}

export async function ensureAutoAccount(DB, { userId, request, issueSession = false }) {
  if (!userId || userId === 'anonymous' || isAccountIdFormat(userId)) {
    throw new Error('Valid user token required to provision virtual account');
  }

  const publicId = await derivePublicPayerRef(userId);
  const nowIso   = new Date().toISOString();

  let account = await getAccountByUserId(DB, userId);

  let created = false;
  if (!account) {
    // Retry in the unlikely event of random Account ID collision
    for (let attempt = 0; attempt < 4; attempt++) {
      const candidateAccountId = generateAccountId();
      try {
        await DB.batch([
          DB.prepare(`
            INSERT INTO accounts (account_id, user_id, email, email_verified, password_hash, display_name, status, failed_login_attempts, locked_until, created_at, updated_at)
            VALUES (?, ?, NULL, 0, NULL, NULL, 'active', 0, NULL, ?, ?)
            ON CONFLICT(user_id) DO NOTHING
          `).bind(candidateAccountId, userId, nowIso, nowIso),
          DB.prepare(`
            INSERT INTO user_credits (user_id, public_id, credits, lifetime)
            VALUES (?, ?, 0, 0)
            ON CONFLICT(user_id) DO UPDATE SET public_id = COALESCE(user_credits.public_id, excluded.public_id)
          `).bind(userId, publicId),
        ]);
        created = true;
        break;
      } catch (err) {
        if (attempt === 3) throw err;
      }
    }

    account = await getAccountByUserId(DB, userId);
  } else {
    // Guarantee user_credits row exists for older accounts
    await DB.prepare(`
      INSERT INTO user_credits (user_id, public_id, credits, lifetime)
      VALUES (?, ?, 0, 0)
      ON CONFLICT(user_id) DO UPDATE SET public_id = COALESCE(user_credits.public_id, excluded.public_id)
    `).bind(userId, publicId).run();
  }

  let session = null;
  if (issueSession && account) {
    session = await createUserSession(DB, account.account_id, request);
  }

  return { account, created, session };
}

export function appendCreditLedgerStatement(DB, {
  id,
  accountId,
  userId,
  txType,
  amount,
  referenceType,
  referenceId,
  description,
  metadata = null,
  createdAt = new Date().toISOString(),
}) {
  const ledgerId = id || generateOpaqueId('led');
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  return DB.prepare(`
    INSERT OR IGNORE INTO credit_ledger
      (id, account_id, user_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at)
    SELECT ?, ?, ?, ?, ?, credits, ?, ?, ?, ?, ?
    FROM user_credits
    WHERE user_id = ?
  `).bind(
    ledgerId,
    accountId || 'acct-pending',
    userId,
    txType,
    Number(amount) || 0,
    referenceType,
    referenceId,
    description || '',
    metadataJson,
    createdAt,
    userId
  );
}
