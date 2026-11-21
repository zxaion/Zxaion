/**
 * core/utils.js — Helper umum: preventTouchSave + objek utils (escapeHtml, debounce, formatNumber, getCloudflareImageUrl).
 * Depends on: (tidak ada; opsional API_BASE dari constants.js)
 */
/** Mencegah long-press "Simpan Gambar" di mobile untuk gambar yang dilindungi. */
function preventTouchSave(e) { e.preventDefault(); }

/**
 * Membangun URL Cloudflare Image Transformation (/cdn-cgi/image/<opsi>/<src>).
 * Contoh: getCloudflareImageUrl('image.jpg', { width: 800, format: 'auto' })
 *      -> '/cdn-cgi/image/width=800,format=auto/image.jpg'
 */
function getCloudflareImageUrl(src, options = {}) {
    if (!src || typeof src !== 'string') return '';
    const trimmed = src.trim();
    if (!trimmed) return '';

    // Jangan ubah data URI, blob URI, URL download langsung, atau URL yang sudah berawalan /cdn-cgi/image/
    if (
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:') ||
        trimmed.startsWith('/cdn-cgi/image/') ||
        /[?&]download=true(?:&|$)/i.test(trimmed)
    ) {
        return trimmed;
    }

    const opts = options || {};
    const directives = [];

    const width   = opts.width ?? opts.w;
    const height  = opts.height ?? opts.h;
    const quality = opts.quality ?? opts.q;
    const fit     = opts.fit;
    const gravity = opts.gravity;
    const dpr     = opts.dpr;
    const blur    = opts.blur;
    const sharpen = opts.sharpen;
    const format  = opts.format !== undefined ? opts.format : (opts.fmt !== undefined ? opts.fmt : 'auto');

    if (Number.isFinite(Number(width)) && Number(width) > 0)     directives.push(`width=${Math.round(Number(width))}`);
    if (Number.isFinite(Number(height)) && Number(height) > 0)   directives.push(`height=${Math.round(Number(height))}`);
    if (Number.isFinite(Number(quality)) && Number(quality) > 0) directives.push(`quality=${Math.round(Number(quality))}`);
    if (fit)     directives.push(`fit=${encodeURIComponent(String(fit).trim())}`);
    if (gravity) directives.push(`gravity=${encodeURIComponent(String(gravity).trim())}`);
    if (dpr)     directives.push(`dpr=${encodeURIComponent(String(dpr).trim())}`);
    if (blur)    directives.push(`blur=${Math.round(Number(blur))}`);
    if (sharpen) directives.push(`sharpen=${encodeURIComponent(String(sharpen).trim())}`);
    if (format)  directives.push(`format=${encodeURIComponent(String(format).trim())}`);

    const apiBase = typeof API_BASE === 'string' ? API_BASE.replace(/\/+$/, '') : '';
    let resolvedSrc = trimmed;
    if (trimmed.startsWith('/') && apiBase) {
        resolvedSrc = `${apiBase}${trimmed}`;
    }

    if (directives.length === 0) return resolvedSrc;

    // Jika URL berasal dari origin worker lain (API_BASE), tempatkan /cdn-cgi/image di host target jika API_BASE ada,
    // atau gunakan /cdn-cgi/image/<opsi>/<path> di origin saat ini.
    const cleanTarget = resolvedSrc.startsWith('/') ? resolvedSrc.slice(1) : resolvedSrc;
    return `/cdn-cgi/image/${directives.join(',')}/${cleanTarget}`;
}

if (typeof window !== 'undefined') {
    window.getCloudflareImageUrl = getCloudflareImageUrl;
}

// --- Utility Functions ---
const utils = {
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    formatNumber(num) {
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
        if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'K';
        return num.toString();
    },

    // Reusable parser untuk angka berformat K/M dari DOM.
    parseFormattedCount(text) {
        if (!text) return 0;
        const s = String(text).trim();
        if (s.endsWith('M')) return Math.round(parseFloat(s) * 1_000_000);
        if (s.endsWith('K')) return Math.round(parseFloat(s) * 1_000);
        return parseInt(s) || 0;
    },

    getCloudflareImageUrl(src, options) {
        return getCloudflareImageUrl(src, options);
    },

    // Alias kompatibilitas yang dipakai modul UI galeri untuk optimasi gambar.
    buildImageUrl(rawUrl, options = {}) {
        return getCloudflareImageUrl(rawUrl, options);
    }
};
