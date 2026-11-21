// Konstanta global backend.
export const PAYPAL_LIVE_BASE    = 'https://api-m.paypal.com';
export const PAYPAL_SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';

export function getPayPalBase(env) {
  return String(env?.PAYPAL_ENV || '').trim().toLowerCase() === 'sandbox'
    ? PAYPAL_SANDBOX_BASE
    : PAYPAL_LIVE_BASE;
}

export const PAYPAL_BASE = PAYPAL_LIVE_BASE;

export const ALLOWED_ORIGINS = [
  'https://zxaion-verse.pages.dev',
  'https://zxaionverse.site',
  'https://www.zxaionverse.site',
  'https://zxaionverse.com',
  'https://www.zxaionverse.com',
  'https://ai.zxaionverse.workers.dev',
];
