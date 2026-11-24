// Virtual Account, Email Verification, Recovery, Sessions & Credit Ledger Routes
import {
  buildSessionCookie,
  clearSessionCookie,
  createUserSession,
  ensureAutoAccount,
  resolveSessionAuth,
  sanitizeAccountView,
} from '../services/accountAuth.js';
import {
  generateOpaqueId,
  generateOtpCode,
  hashPassword,
  isAccountIdFormat,
  normalizeEmail,
  sha256Hex,
  verifyPassword,
} from '../utils/userToken.js';

const MAX_LOGIN_FAILURES = 5;
const LOCKOUT_MINUTES = 15;
const OTP_EXPIRY_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 5;

function jsonRes(payload, status = 200, corsHeaders = {}, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

async function fetchWalletSnapshot(DB, userId) {
  const wallet = await DB.prepare(
    'SELECT credits, lifetime, recovery_hash FROM user_credits WHERE user_id = ?'
  ).bind(userId).first();
  const purchasedRows = await DB.prepare(
    'SELECT photo_id FROM purchased_images WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 5000'
  ).bind(userId).all();
  return {
    credits: Number(wallet?.credits || 0),
    lifetime: !!wallet?.lifetime,
    hasRecoveryKey: !!wallet?.recovery_hash,
    purchased: (purchasedRows?.results || []).map((r) => r.photo_id),
  };
}

function getClientIp(request, fallback = 'client') {
  const cf = request.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();
  return fallback;
}

// ================================================================
// POST /api/account/auto
// Automatic Account Generator: guarantees a permanent Account ID (ZXA-XXXX-XXXX)
// ================================================================
export async function handleAutoAccount({ request, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });

  if (!auth.authenticated) {
    if (auth.requiresLogin) {
      return jsonRes({
        success: false,
        requiresLogin: true,
        error: 'This wallet is protected by an account password. Please sign in.',
      }, 401, corsHeaders);
    }
    return jsonRes({ success: false, error: 'Valid user token required' }, 401, corsHeaders);
  }

  if (typeof checkRateLimit === 'function') {
    const ip = getClientIp(request, auth.userId);
    if (!await checkRateLimit('account_auto', ip, 120, 3600)) {
      return jsonRes({ success: false, error: 'Too many requests' }, 429, corsHeaders);
    }
  }

  try {
    const { account, created } = await ensureAutoAccount(DB, {
      userId: auth.userId,
      request,
      issueSession: false,
    });
    const wallet = await fetchWalletSnapshot(DB, auth.userId);
    return jsonRes({
      success: true,
      created,
      account: sanitizeAccountView(account),
      wallet,
    }, 200, corsHeaders);
  } catch (err) {
    console.error('[Account] auto provision error:', err.message);
    return jsonRes({ success: false, error: 'Failed to provision virtual account' }, 500, corsHeaders);
  }
}

// ================================================================
// GET /api/account/me
// Returns authenticated account profile, wallet balance, recent ledger & orders
// ================================================================
export async function handleAccountMe({ request, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated) {
    if (auth.requiresLogin) {
      return jsonRes({
        success: false,
        requiresLogin: true,
        error: 'Account login required to access wallet',
      }, 401, corsHeaders);
    }
    return jsonRes({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  try {
    const { account } = await ensureAutoAccount(DB, { userId: auth.userId, request, issueSession: false });
    const wallet = await fetchWalletSnapshot(DB, auth.userId);

    const ledgerRes = await DB.prepare(
      'SELECT id, account_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(auth.userId, 20, 0).all();

    const ordersRes = await DB.prepare(
      'SELECT id, order_id, capture_id, pack_key, amount, status, created_at, completed_at FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    ).bind(auth.userId).all();

    return jsonRes({
      success: true,
      authVia: auth.via,
      account: sanitizeAccountView(account),
      wallet,
      recentLedger: ledgerRes?.results || [],
      recentOrders: ordersRes?.results || [],
    }, 200, corsHeaders);
  } catch (err) {
    console.error('[Account] /me error:', err.message);
    return jsonRes({ success: false, error: 'Failed to load account profile' }, 500, corsHeaders);
  }
}

async function createAndSendOtp({ DB, env, sendEmail, accountId, email, purpose }) {
  const code = generateOtpCode();
  const codeHash = await sha256Hex(`${purpose}:${email}:${code}`);
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const verifyId = generateOpaqueId('otp');

  // Invalidate any prior unused OTPs for the same email + purpose
  await DB.prepare(
    'UPDATE email_verifications SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL'
  ).bind(nowIso, email, purpose).run();

  await DB.prepare(`
    INSERT INTO email_verifications (id, account_id, email, purpose, code_hash, attempts, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?)
  `).bind(verifyId, accountId, email, purpose, codeHash, expiresAt, nowIso).run();

  const emailResult = await sendEmail({
    to: email,
    purpose,
    code,
    accountId,
    expiresMinutes: OTP_EXPIRY_MINUTES,
  });

  const allowDevPreview = env?.ALLOW_DEV_OTP_PREVIEW === 'true';
  return {
    dispatched: !!emailResult?.sent,
    provider: emailResult?.provider || 'unconfigured',
    error: emailResult?.error || null,
    expiresAt,
    devOtpPreview: !emailResult?.sent && allowDevPreview ? code : undefined,
  };
}

// ================================================================
// POST /api/account/register
// Upgrades current auto-provisioned Virtual Account (preserving credits & purchases)
// with email + PBKDF2 password, creates authenticated session, and dispatches verification OTP
// ================================================================
export async function handleRegisterAccount({ request, env, DB, corsHeaders, getUserToken, checkRateLimit, sendEmail }) {
  const ip = getClientIp(request, 'register');
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('account_register', ip, 15, 3600)) {
    return jsonRes({ success: false, error: 'Too many registration attempts. Please try again later.' }, 429, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ success: false, error: 'Invalid request body' }, 400, corsHeaders);
  }

  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 60) : null;

  if (!email) {
    return jsonRes({ success: false, error: 'Please provide a valid email address' }, 400, corsHeaders);
  }
  if (password.length < 8 || password.length > 128) {
    return jsonRes({ success: false, error: 'Password must be between 8 and 128 characters' }, 400, corsHeaders);
  }

  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.userId || auth.userId === 'anonymous') {
    return jsonRes({ success: false, error: 'Active session or user token required' }, 401, corsHeaders);
  }

  try {
    const emailOwner = await DB.prepare(
      'SELECT account_id, user_id FROM accounts WHERE email = ? LIMIT 1'
    ).bind(email).first();

    if (emailOwner && emailOwner.user_id !== auth.userId) {
      return jsonRes({ success: false, error: 'An account with this email already exists. Please sign in instead.' }, 409, corsHeaders);
    }

    const { account } = await ensureAutoAccount(DB, { userId: auth.userId, request, issueSession: false });
    if (account.password_hash) {
      return jsonRes({ success: false, error: 'This virtual account is already registered.' }, 409, corsHeaders);
    }

    const passwordHash = await hashPassword(password);
    const nowIso = new Date().toISOString();

    await DB.prepare(`
      UPDATE accounts
      SET email = ?, email_verified = 0, password_hash = ?, display_name = ?, updated_at = ?
      WHERE account_id = ?
    `).bind(email, passwordHash, displayName || account.display_name || null, nowIso, account.account_id).run();

    const updatedAccount = await DB.prepare(
      'SELECT account_id, user_id, email, email_verified, password_hash, display_name, status, created_at, updated_at, last_login_at FROM accounts WHERE account_id = ? LIMIT 1'
    ).bind(account.account_id).first();

    const session = await createUserSession(DB, account.account_id, request);
    const wallet  = await fetchWalletSnapshot(DB, auth.userId);
    const otpInfo = await createAndSendOtp({
      DB,
      env,
      sendEmail,
      accountId: account.account_id,
      email,
      purpose: 'verify_email',
    });

    return jsonRes({
      success: true,
      account: sanitizeAccountView(updatedAccount),
      wallet,
      sessionToken: session.sessionToken,
      verification: {
        required: true,
        emailDispatched: otpInfo.dispatched,
        provider: otpInfo.provider,
        expiresAt: otpInfo.expiresAt,
        ...(otpInfo.devOtpPreview ? { devOtpPreview: otpInfo.devOtpPreview } : {}),
        ...(otpInfo.error && !otpInfo.dispatched ? { deliveryWarning: otpInfo.error } : {}),
      },
    }, 201, corsHeaders, {
      'Set-Cookie': buildSessionCookie(session.sessionToken, request),
    });
  } catch (err) {
    console.error('[Account] register error:', err.message);
    return jsonRes({ success: false, error: 'Registration failed' }, 500, corsHeaders);
  }
}

// ================================================================
// POST /api/account/resend-verification
// ================================================================
export async function handleResendVerification({ request, env, DB, corsHeaders, getUserToken, checkRateLimit, sendEmail }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.account) {
    return jsonRes({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  if (!auth.account.email) {
    return jsonRes({ success: false, error: 'Register an email address first' }, 400, corsHeaders);
  }
  if (auth.account.email_verified) {
    return jsonRes({ success: true, alreadyVerified: true, message: 'Email is already verified' }, 200, corsHeaders);
  }

  const ip = getClientIp(request, auth.account.account_id);
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('account_resend_otp', ip, 6, 900)) {
    return jsonRes({ success: false, error: 'Please wait before requesting another verification code.' }, 429, corsHeaders);
  }

  try {
    const otpInfo = await createAndSendOtp({
      DB,
      env,
      sendEmail,
      accountId: auth.account.account_id,
      email: auth.account.email,
      purpose: 'verify_email',
    });

    if (!otpInfo.dispatched && !otpInfo.devOtpPreview) {
      return jsonRes({
        success: false,
        emailNotConfigured: true,
        error: otpInfo.error || 'Email delivery service is not configured on the server.',
      }, 503, corsHeaders);
    }

    return jsonRes({
      success: true,
      emailDispatched: otpInfo.dispatched,
      provider: otpInfo.provider,
      expiresAt: otpInfo.expiresAt,
      ...(otpInfo.devOtpPreview ? { devOtpPreview: otpInfo.devOtpPreview } : {}),
    }, 200, corsHeaders);
  } catch (err) {
    console.error('[Account] resend verification error:', err.message);
    return jsonRes({ success: false, error: 'Failed to send verification code' }, 500, corsHeaders);
  }
}

// ================================================================
// POST /api/account/verify-email
// ================================================================
export async function handleVerifyEmail({ request, DB, corsHeaders, getUserToken, checkRateLimit }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.account) {
    return jsonRes({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  const ip = getClientIp(request, auth.account.account_id);
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('account_verify_email', ip, 15, 900)) {
    return jsonRes({ success: false, error: 'Too many verification attempts. Please wait.' }, 429, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ success: false, error: 'Invalid request body' }, 400, corsHeaders);
  }

  const code = String(body?.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return jsonRes({ success: false, error: 'Enter the 6-digit verification code' }, 400, corsHeaders);
  }
  if (!auth.account.email) {
    return jsonRes({ success: false, error: 'No email registered on this account' }, 400, corsHeaders);
  }

  try {
    const record = await DB.prepare(
      'SELECT id, account_id, email, purpose, code_hash, attempts, expires_at, used_at FROM email_verifications WHERE email = ? AND purpose = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1'
    ).bind(auth.account.email, 'verify_email').first();

    if (!record) {
      return jsonRes({ success: false, error: 'No active verification code found. Request a new code.' }, 400, corsHeaders);
    }

    const nowIso = new Date().toISOString();
    if (record.expires_at <= nowIso) {
      return jsonRes({ success: false, error: 'Verification code has expired. Request a new code.' }, 400, corsHeaders);
    }
    if ((record.attempts || 0) >= MAX_OTP_ATTEMPTS) {
      return jsonRes({ success: false, error: 'Too many invalid code attempts. Request a new code.' }, 429, corsHeaders);
    }

    const expectedHash = await sha256Hex(`verify_email:${auth.account.email}:${code}`);
    if (expectedHash !== record.code_hash) {
      await DB.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
      return jsonRes({ success: false, error: 'Invalid verification code' }, 400, corsHeaders);
    }

    await DB.batch([
      DB.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').bind(nowIso, record.id),
      DB.prepare('UPDATE accounts SET email_verified = 1, updated_at = ? WHERE account_id = ?').bind(nowIso, auth.account.account_id),
    ]);

    const updated = await DB.prepare(
      'SELECT account_id, user_id, email, email_verified, password_hash, display_name, status, created_at, updated_at, last_login_at FROM accounts WHERE account_id = ? LIMIT 1'
    ).bind(auth.account.account_id).first();

    return jsonRes({
      success: true,
      account: sanitizeAccountView(updated),
      message: 'Email verified successfully',
    }, 200, corsHeaders);
  } catch (err) {
    console.error('[Account] verify-email error:', err.message);
    return jsonRes({ success: false, error: 'Verification failed' }, 500, corsHeaders);
  }
}

// ================================================================
// POST /api/account/login
// Requires email + password. Explicitly forbids Account ID as login credential.
// ================================================================
export async function handleLoginAccount({ request, DB, corsHeaders, checkRateLimit }) {
  const ip = getClientIp(request, 'login');
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('account_login', ip, 30, 900)) {
    return jsonRes({ success: false, error: 'Too many login attempts. Please slow down.' }, 429, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ success: false, error: 'Invalid request body' }, 400, corsHeaders);
  }

  const rawIdentifier = String(body?.email || body?.identifier || body?.accountId || '').trim();
  const password = typeof body?.password === 'string' ? body.password : '';

  if (isAccountIdFormat(rawIdentifier) || isAccountIdFormat(password)) {
    return jsonRes({
      success: false,
      error: 'Account ID cannot be used as a login credential. Sign in with your registered email and password.',
    }, 400, corsHeaders);
  }

  const email = normalizeEmail(rawIdentifier);
  if (!email || !password) {
    return jsonRes({ success: false, error: 'Email and password are required' }, 400, corsHeaders);
  }

  try {
    const account = await DB.prepare(
      'SELECT account_id, user_id, email, email_verified, password_hash, display_name, status, failed_login_attempts, locked_until, created_at, updated_at, last_login_at FROM accounts WHERE email = ? LIMIT 1'
    ).bind(email).first();

    if (!account || !account.password_hash) {
      return jsonRes({ success: false, error: 'Invalid email or password' }, 401, corsHeaders);
    }

    if (account.status !== 'active') {
      return jsonRes({ success: false, error: 'This account is suspended' }, 403, corsHeaders);
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    if (account.locked_until && account.locked_until > nowIso) {
      return jsonRes({
        success: false,
        error: 'Account temporarily locked due to repeated failed sign-ins. Try again later.',
        lockedUntil: account.locked_until,
      }, 429, corsHeaders);
    }

    const ok = await verifyPassword(password, account.password_hash);
    if (!ok) {
      const nextFailures = (Number(account.failed_login_attempts) || 0) + 1;
      const lockedUntil = nextFailures >= MAX_LOGIN_FAILURES
        ? new Date(nowMs + LOCKOUT_MINUTES * 60 * 1000).toISOString()
        : null;
      await DB.prepare(
        'UPDATE accounts SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE account_id = ?'
      ).bind(nextFailures, lockedUntil, nowIso, account.account_id).run();

      return jsonRes({
        success: false,
        error: lockedUntil
          ? `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`
          : 'Invalid email or password',
      }, lockedUntil ? 429 : 401, corsHeaders);
    }

    await DB.prepare(
      'UPDATE accounts SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE account_id = ?'
    ).bind(nowIso, nowIso, account.account_id).run();

    const session = await createUserSession(DB, account.account_id, request);
    const updated = await DB.prepare(
      'SELECT account_id, user_id, email, email_verified, password_hash, display_name, status, created_at, updated_at, last_login_at FROM accounts WHERE account_id = ? LIMIT 1'
    ).bind(account.account_id).first();
    const wallet = await fetchWalletSnapshot(DB, account.user_id);

    return jsonRes({
      success: true,
      account: sanitizeAccountView(updated),
      wallet,
      userToken: account.user_id,
      sessionToken: session.sessionToken,
    }, 200, corsHeaders, {
      'Set-Cookie': buildSessionCookie(session.sessionToken, request),
    });
  } catch (err) {
    console.error('[Account] login error:', err.message);
    return jsonRes({ success: false, error: 'Login failed' }, 500, corsHeaders);
  }
}

// ================================================================
// POST /api/account/logout
// ================================================================
export async function handleLogoutAccount({ request, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (auth.session?.session_id && auth.accountId) {
    try {
      await DB.prepare(
        'UPDATE user_sessions SET revoked_at = ? WHERE session_id = ? AND account_id = ? AND revoked_at IS NULL'
      ).bind(new Date().toISOString(), auth.session.session_id, auth.accountId).run();
    } catch {}
  }

  return jsonRes(
    { success: true, message: 'Signed out' },
    200,
    corsHeaders,
    { 'Set-Cookie': clearSessionCookie(request) }
  );
}

// ================================================================
// POST /api/account/recover/request
// Sends recovery OTP only to verified registered emails
// ================================================================
export async function handleRecoverRequest({ request, env, DB, corsHeaders, checkRateLimit, sendEmail }) {
  const ip = getClientIp(request, 'recover-req');
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('account_recover_req', ip, 6, 900)) {
    return jsonRes({ success: false, error: 'Too many recovery requests. Please try again later.' }, 429, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ success: false, error: 'Invalid request body' }, 400, corsHeaders);
  }

  if (isAccountIdFormat(body?.email || body?.accountId)) {
    return jsonRes({
      success: false,
      error: 'Account recovery requires your verified email address, not Account ID.',
    }, 400, corsHeaders);
  }

  const email = normalizeEmail(body?.email);
  if (!email) {
    return jsonRes({ success: false, error: 'Please enter a valid email address' }, 400, corsHeaders);
  }

  try {
    const account = await DB.prepare(
      'SELECT account_id, user_id, email, email_verified, status FROM accounts WHERE email = ? LIMIT 1'
    ).bind(email).first();

    // Never enumerate accounts blindly unless unverified vs verified matters securely:
    if (!account || !account.email_verified) {
      return jsonRes({
        success: true,
        message: 'If that verified email is registered, a recovery verification code has been sent.',
      }, 200, corsHeaders);
    }

    const otpInfo = await createAndSendOtp({
      DB,
      env,
      sendEmail,
      accountId: account.account_id,
      email,
      purpose: 'recover_account',
    });

    if (!otpInfo.dispatched && !otpInfo.devOtpPreview) {
      return jsonRes({
        success: false,
        emailNotConfigured: true,
        error: otpInfo.error || 'Email recovery service is not configured on the server.',
      }, 503, corsHeaders);
    }

    return jsonRes({
      success: true,
      message: 'Recovery verification code dispatched to your verified email.',
      expiresAt: otpInfo.expiresAt,
      ...(otpInfo.devOtpPreview ? { devOtpPreview: otpInfo.devOtpPreview } : {}),
    }, 200, corsHeaders);
  } catch (err) {
    console.error('[Account] recover/request error:', err.message);
    return jsonRes({ success: false, error: 'Failed to initiate recovery' }, 500, corsHeaders);
  }
}

// ================================================================
// POST /api/account/recover/confirm
// Verifies OTP for verified email, resets password, revokes all prior sessions, and opens new session
// ================================================================
export async function handleRecoverConfirm({ request, DB, corsHeaders, checkRateLimit }) {
  const ip = getClientIp(request, 'recover-confirm');
  if (typeof checkRateLimit === 'function' && !await checkRateLimit('account_recover_confirm', ip, 10, 900)) {
    return jsonRes({ success: false, error: 'Too many confirmation attempts. Please wait.' }, 429, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ success: false, error: 'Invalid request body' }, 400, corsHeaders);
  }

  const email = normalizeEmail(body?.email);
  const code  = String(body?.code || '').trim();
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

  if (!email) {
    return jsonRes({ success: false, error: 'Valid email is required' }, 400, corsHeaders);
  }
  if (!/^\d{6}$/.test(code)) {
    return jsonRes({ success: false, error: 'Enter the 6-digit recovery code' }, 400, corsHeaders);
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return jsonRes({ success: false, error: 'New password must be 8 to 128 characters' }, 400, corsHeaders);
  }

  try {
    const account = await DB.prepare(
      'SELECT account_id, user_id, email, email_verified, status FROM accounts WHERE email = ? LIMIT 1'
    ).bind(email).first();

    if (!account || !account.email_verified) {
      return jsonRes({ success: false, error: 'Invalid or unverified account recovery request' }, 400, corsHeaders);
    }

    const record = await DB.prepare(
      'SELECT id, account_id, email, purpose, code_hash, attempts, expires_at, used_at FROM email_verifications WHERE email = ? AND purpose = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1'
    ).bind(email, 'recover_account').first();

    if (!record) {
      return jsonRes({ success: false, error: 'No active recovery code found' }, 400, corsHeaders);
    }

    const nowIso = new Date().toISOString();
    if (record.expires_at <= nowIso) {
      return jsonRes({ success: false, error: 'Recovery code has expired' }, 400, corsHeaders);
    }
    if ((record.attempts || 0) >= MAX_OTP_ATTEMPTS) {
      return jsonRes({ success: false, error: 'Too many invalid attempts. Request a new code.' }, 429, corsHeaders);
    }

    const expectedHash = await sha256Hex(`recover_account:${email}:${code}`);
    if (expectedHash !== record.code_hash) {
      await DB.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
      return jsonRes({ success: false, error: 'Invalid recovery verification code' }, 400, corsHeaders);
    }

    const newPasswordHash = await hashPassword(newPassword);

    await DB.batch([
      DB.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').bind(nowIso, record.id),
      DB.prepare('UPDATE accounts SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE account_id = ?')
        .bind(newPasswordHash, nowIso, nowIso, account.account_id),
      DB.prepare('UPDATE user_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL')
        .bind(nowIso, account.account_id),
    ]);

    const session = await createUserSession(DB, account.account_id, request);
    const updated = await DB.prepare(
      'SELECT account_id, user_id, email, email_verified, password_hash, display_name, status, created_at, updated_at, last_login_at FROM accounts WHERE account_id = ? LIMIT 1'
    ).bind(account.account_id).first();
    const wallet = await fetchWalletSnapshot(DB, account.user_id);

    return jsonRes({
      success: true,
      message: 'Account recovered and all previous sessions revoked.',
      account: sanitizeAccountView(updated),
      wallet,
      userToken: account.user_id,
      sessionToken: session.sessionToken,
    }, 200, corsHeaders, {
      'Set-Cookie': buildSessionCookie(session.sessionToken, request),
    });
  } catch (err) {
    console.error('[Account] recover/confirm error:', err.message);
    return jsonRes({ success: false, error: 'Recovery confirmation failed' }, 500, corsHeaders);
  }
}

// ================================================================
// GET /api/account/ledger?limit=50&offset=0&type=...
// Immutable Credit Ledger history for current authenticated account
// ================================================================
export async function handleAccountLedger({ request, url, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated) {
    return jsonRes({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
  const txType = (url.searchParams.get('type') || '').trim();

  try {
    const stmt = txType
      ? DB.prepare(
          'SELECT id, account_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at FROM credit_ledger WHERE user_id = ? AND tx_type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(auth.userId, txType, limit, offset)
      : DB.prepare(
          'SELECT id, account_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(auth.userId, limit, offset);

    const rows = await stmt.all();
    return jsonRes({
      success: true,
      entries: rows?.results || [],
      limit,
      offset,
    }, 200, corsHeaders);
  } catch (err) {
    console.error('[Account] ledger error:', err.message);
    return jsonRes({ success: false, error: 'Failed to load credit ledger' }, 500, corsHeaders);
  }
}

// ================================================================
// GET /api/account/sessions
// POST /api/account/sessions/revoke
// POST /api/account/sessions/revoke-others
// ================================================================
export async function handleListSessions({ request, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated) {
    return jsonRes({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  try {
    const { account } = await ensureAutoAccount(DB, { userId: auth.userId, request, issueSession: false });
    const nowIso = new Date().toISOString();
    const res = await DB.prepare(
      'SELECT session_id, user_agent, ip_hash, expires_at, revoked_at, last_seen_at, created_at FROM user_sessions WHERE account_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC LIMIT 20'
    ).bind(account.account_id, nowIso).all();

    const currentSid = auth.session?.session_id || null;
    const sessions = (res?.results || []).map((s) => ({
      ...s,
      isCurrent: currentSid ? s.session_id === currentSid : false,
    }));

    return jsonRes({ success: true, sessions }, 200, corsHeaders);
  } catch (err) {
    console.error('[Account] list sessions error:', err.message);
    return jsonRes({ success: false, error: 'Failed to load sessions' }, 500, corsHeaders);
  }
}

export async function handleRevokeSession({ request, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.account) {
    return jsonRes({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ success: false, error: 'Invalid request body' }, 400, corsHeaders);
  }

  const targetSessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!targetSessionId) {
    return jsonRes({ success: false, error: 'sessionId is required' }, 400, corsHeaders);
  }

  try {
    const res = await DB.prepare(
      'UPDATE user_sessions SET revoked_at = ? WHERE session_id = ? AND account_id = ? AND revoked_at IS NULL'
    ).bind(new Date().toISOString(), targetSessionId, auth.account.account_id).run();

    const isSelf = auth.session?.session_id === targetSessionId;
    return jsonRes(
      { success: true, revoked: (res?.meta?.changes || 0) > 0, revokedCurrent: isSelf },
      200,
      corsHeaders,
      isSelf ? { 'Set-Cookie': clearSessionCookie(request) } : {}
    );
  } catch (err) {
    console.error('[Account] revoke session error:', err.message);
    return jsonRes({ success: false, error: 'Failed to revoke session' }, 500, corsHeaders);
  }
}

export async function handleRevokeOtherSessions({ request, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated || !auth.account) {
    return jsonRes({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  try {
    const nowIso = new Date().toISOString();
    let res;
    if (auth.session?.session_id) {
      res = await DB.prepare(
        'UPDATE user_sessions SET revoked_at = ? WHERE account_id = ? AND session_id != ? AND revoked_at IS NULL'
      ).bind(nowIso, auth.account.account_id, auth.session.session_id).run();
    } else {
      res = await DB.prepare(
        'UPDATE user_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL'
      ).bind(nowIso, auth.account.account_id).run();
    }

    return jsonRes({
      success: true,
      revokedCount: res?.meta?.changes || 0,
    }, 200, corsHeaders);
  } catch (err) {
    console.error('[Account] revoke other sessions error:', err.message);
    return jsonRes({ success: false, error: 'Failed to revoke other sessions' }, 500, corsHeaders);
  }
}

// ================================================================
// GET /api/account/export
// Personal account + wallet + immutable ledger JSON export for user backup
// ================================================================
export async function handleAccountExport({ request, DB, corsHeaders, getUserToken }) {
  const auth = await resolveSessionAuth({ request, DB, getUserToken });
  if (!auth.authenticated) {
    return jsonRes({ success: false, error: 'Authentication required' }, 401, corsHeaders);
  }

  try {
    const { account } = await ensureAutoAccount(DB, { userId: auth.userId, request, issueSession: false });
    const wallet = await fetchWalletSnapshot(DB, auth.userId);
    const ledgerRes = await DB.prepare(
      'SELECT id, account_id, tx_type, amount, balance_after, reference_type, reference_id, description, metadata_json, created_at FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(auth.userId, 500, 0).all();
    const ordersRes = await DB.prepare(
      'SELECT id, order_id, capture_id, pack_key, amount, status, created_at, completed_at FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(auth.userId).all();

    const exportPayload = {
      exported_at: new Date().toISOString(),
      account: sanitizeAccountView(account),
      wallet,
      orders: ordersRes?.results || [],
      credit_ledger: ledgerRes?.results || [],
    };
    const checksumSha = await sha256Hex(JSON.stringify(exportPayload));

    return new Response(JSON.stringify({ ...exportPayload, checksum_sha: checksumSha }, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="zxaion-wallet-${account.account_id}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[Account] export error:', err.message);
    return jsonRes({ success: false, error: 'Failed to export wallet data' }, 500, corsHeaders);
  }
}
