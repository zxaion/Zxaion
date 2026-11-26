// Utilitas token user, Account ID permanen, password hashing (PBKDF2-SHA256), OTP, dan HTML escaping.

export function isAccountIdFormat(value) {
  return /^ZXA-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(String(value || '').trim());
}

export function getUserToken(req) {
  const raw = (req.headers.get('X-User-Token') || '').trim();
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(raw)) return 'anonymous';
  // Account ID must NEVER be accepted as a replacement for an auth token/credential
  if (isAccountIdFormat(raw)) return 'anonymous';
  return raw;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const clean = String(hex || '').trim();
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function constantTimeEqual(a, b) {
  const bytesA = new TextEncoder().encode(String(a || ''));
  const bytesB = new TextEncoder().encode(String(b || ''));
  const maxLen = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (bytesA[i] || 0) ^ (bytesB[i] || 0);
  }
  return diff === 0;
}

export async function sha256Hex(input) {
  const data   = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export async function derivePublicPayerRef(userId) {
  if (!userId || userId === 'anonymous') return null;
  const digest = await sha256Hex(`payer:${userId}`);
  return `pub_${digest.slice(0, 32)}`;
}

export async function maskTokenForLog(userId) {
  if (!userId || userId === 'anonymous') return 'anon';
  const digest = await sha256Hex(userId);
  return `u_${digest.slice(0, 10)}`;
}

export function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes    = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  return `ZX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function generateAccountId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes    = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  return `ZXA-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

export function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `zxs_${toHex(bytes)}`;
}

export function generateOpaqueId(prefix = 'id') {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${toHex(bytes)}`;
}

export function generateOtpCode() {
  const buf = new Uint32Array(1);
  // Rejection sampling to avoid modulo bias over 0..999999
  const maxValid = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  let val;
  do {
    crypto.getRandomValues(buf);
    val = buf[0];
  } while (val >= maxValid);
  return String(val % 1_000_000).padStart(6, '0');
}

export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 190) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return null;
  return email;
}

const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Password must be between 8 and 128 characters');
  }
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 500_000 || !salt || !expectedHex) {
    return false;
  }
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return constantTimeEqual(toHex(bits), expectedHex);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
