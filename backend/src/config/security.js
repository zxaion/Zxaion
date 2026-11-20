// Content-Security-Policy untuk halaman HTML.
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "img-src 'self' data: https: blob:; " +
  "script-src 'self' 'unsafe-inline' " +
    "https://cdn.tailwindcss.com " +
    "https://cdnjs.cloudflare.com " +
    "https://www.paypal.com " +
    "https://www.gstatic.com; " +
  "style-src 'self' 'unsafe-inline' " +
    "https://cdnjs.cloudflare.com " +
    "https://fonts.googleapis.com; " +
  "font-src 'self' " +
    "https://cdnjs.cloudflare.com " +
    "https://fonts.gstatic.com; " +
  "connect-src 'self' " +
    "https://ai.zxaionverse.workers.dev " +
    "https://www.paypal.com " +
    "https://www.google.com; " +
  "frame-src " +
    "https://www.paypal.com " +
    "https://www.google.com;";
