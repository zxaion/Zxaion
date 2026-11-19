// Content-Security-Policy untuk halaman HTML.
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "img-src 'self' data: https: blob:; " +
  "script-src 'self' 'unsafe-inline' " +
    "https://cdn.tailwindcss.com " +
    "https://cdnjs.cloudflare.com " +
    "https://www.paypal.com " +
    "https://pagead2.googlesyndication.com " +
    "https://partner.googleadservices.com " +
    "https://tpc.googlesyndication.com " +
    "https://securepubads.g.doubleclick.net " +
    "https://www.googletagservices.com " +
    "https://www.gstatic.com " +
    "https://adservice.google.com " +
    "https://adservice.google.co.id; " +
  "style-src 'self' 'unsafe-inline' " +
    "https://cdnjs.cloudflare.com " +
    "https://fonts.googleapis.com; " +
  "font-src 'self' " +
    "https://cdnjs.cloudflare.com " +
    "https://fonts.gstatic.com; " +
  "connect-src 'self' " +
    "https://ai.zxaionverse.workers.dev " +
    "https://www.paypal.com " +
    "https://pagead2.googlesyndication.com " +
    "https://googleads.g.doubleclick.net " +
    "https://www.google.com; " +
  "frame-src " +
    "https://www.paypal.com " +
    "https://googleads.g.doubleclick.net " +
    "https://tpc.googlesyndication.com " +
    "https://www.google.com;";
