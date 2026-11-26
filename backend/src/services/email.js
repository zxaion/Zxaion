// Transactional email dispatch service (Resend HTTPS API or Cloudflare Email Service binding)
// Never fabricates delivery when credentials are unconfigured.

import { escapeHtml } from '../utils/userToken.js';

export function buildVerificationEmailContent({ purpose, code, accountId, expiresMinutes = 15 }) {
  const isRecovery = purpose === 'recover_account';
  const subject = isRecovery
    ? `[ZXAION VERSE] Account Recovery OTP (${accountId})`
    : `[ZXAION VERSE] Verify Your Email (${accountId})`;

  const heading = isRecovery ? 'Account Recovery Verification' : 'Verify Your ZXAION VERSE Email';
  const lead = isRecovery
    ? `Use this one-time code to reset the password and recover your ZXAION VERSE Virtual Account (${accountId}).`
    : `Use this one-time code to verify your email address for Virtual Account ${accountId}.`;

  const text = `${heading}\n\n${lead}\n\nVerification Code: ${code}\nExpires in: ${expiresMinutes} minutes.\n\nIf you did not request this, you can safely ignore this message.`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#09090b;color:#f4f4f5;font-family:Inter,system-ui,-apple-system,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#18181b;border:1px solid #27272a;border-radius:14px;padding:28px;">
    <div style="font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#f59e0b;margin-bottom:8px;">ZXAION VERSE WALLET</div>
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#ffffff;">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#a1a1aa;">${escapeHtml(lead)}</p>
    <div style="background:#09090b;border:1px solid #3f3f46;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#a1a1aa;margin-bottom:6px;">One-Time Verification Code</div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:800;letter-spacing:0.24em;color:#fbbf24;">${escapeHtml(code)}</div>
    </div>
    <p style="margin:0;font-size:12px;color:#71717a;">Account ID: <strong style="color:#e4e4e7;">${escapeHtml(accountId)}</strong> &bull; Expires in ${expiresMinutes} minutes.</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export async function dispatchTransactionalEmail(env, { to, purpose, code, accountId, expiresMinutes = 15 }) {
  const { subject, text, html } = buildVerificationEmailContent({ purpose, code, accountId, expiresMinutes });

  // 1. Cloudflare Email Workers binding (if configured)
  if (env?.SEND_EMAIL && typeof env.SEND_EMAIL.send === 'function') {
    const from = env.EMAIL_FROM || 'noreply@zxaionverse.com';
    try {
      await env.SEND_EMAIL.send({
        from,
        to,
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      });
      return { sent: true, provider: 'cf-email-service' };
    } catch (err) {
      console.error('[Email] Cloudflare SEND_EMAIL failed:', err.message);
      return { sent: false, provider: 'cf-email-service', error: err.message };
    }
  }

  // 2. Resend HTTPS API (Cloudflare Worker Secret: RESEND_API_KEY + EMAIL_FROM)
  const apiKey = env?.RESEND_API_KEY || (typeof process !== 'undefined' ? process.env?.RESEND_API_KEY : '');
  const fromEmail = env?.EMAIL_FROM || (typeof process !== 'undefined' ? process.env?.EMAIL_FROM : '') || 'ZXAION VERSE <onboarding@resend.dev>';

  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          text,
          html,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('[Email] Resend API error:', res.status, errBody);
        return { sent: false, provider: 'resend', error: `Resend HTTP ${res.status}` };
      }
      const data = await res.json().catch(() => ({}));
      return { sent: true, provider: 'resend', messageId: data?.id || null };
    } catch (err) {
      console.error('[Email] Resend fetch failed:', err.message);
      return { sent: false, provider: 'resend', error: err.message };
    }
  }

  // Honest unconfigured result — caller handles production error vs explicit local dev testing
  return {
    sent: false,
    provider: 'unconfigured',
    error: 'Email service secret (RESEND_API_KEY / SEND_EMAIL) is not configured',
  };
}
