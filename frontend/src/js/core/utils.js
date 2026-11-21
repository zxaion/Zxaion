/**
 * core/utils.js — Helper umum: preventTouchSave + objek utils (escapeHtml, debounce, formatNumber, getCloudflareImageUrl).
 * Depends on: (tidak ada; opsional API_BASE dari constants.js)
 */
/**
 * Mencegah long-press "Simpan Gambar" di mobile untuk gambar yang dilindungi.
 */
function preventTouchSave(e) { e.preventDefault(); }

function getResolvedApiBase() {
    return typeof API_BASE === 'string' ? API_BASE.replace(/\/+$/, '') : '';
}

function encodeImageUrlPath(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    if (!trimmed) return '';

    if (
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:') ||
        trimmed.startsWith('/cdn-cgi/image/')
    ) {
        return trimmed;
    }

    const apiBase = getResolvedApiBase();
    let resolved = trimmed;
    if (trimmed.startsWith('/api/') && apiBase) {
        resolved = `${apiBase}${trimmed}`;
    } else if (trimmed.startsWith('/') && apiBase && /^\/api(\/|$)/.test(trimmed)) {
        resolved = `${apiBase}${trimmed}`;
    }

    const [baseAndPath, hashPart] = resolved.split('#');
    const qIdx = baseAndPath.indexOf('?');
    const pathOnly = qIdx >= 0 ? baseAndPath.slice(0, qIdx) : baseAndPath;
    const queryOnly = qIdx >= 0 ? baseAndPath.slice(qIdx) : '';

    // Encode spasi/karakter khusus tanpa melakukan double-encode pada %20 atau %2F
    let encodedPath = pathOnly;
    try {
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(pathOnly)) {
            const parsed = new URL(pathOnly);
            const safeSegments = parsed.pathname.split('/').map((seg) => {
                if (!seg) return '';
                try { return encodeURIComponent(decodeURIComponent(seg)); } catch { return encodeURIComponent(seg); }
            });
            encodedPath = `${parsed.origin}${safeSegments.join('/')}`;
        } else {
            encodedPath = pathOnly.split('/').map((seg) => {
                if (!seg) return '';
                try { return encodeURIComponent(decodeURIComponent(seg)); } catch { return encodeURIComponent(seg); }
            }).join('/');
        }
    } catch {
        encodedPath = pathOnly.replace(/ /g, '%20');
    }

    return `${encodedPath}${queryOnly}${hashPart !== undefined ? '#' + hashPart : ''}`;
}

function buildWorkerTransformUrl(src, options = {}) {
    const encoded = encodeImageUrlPath(src);
    if (!encoded) return '';
    if (encoded.startsWith('data:') || encoded.startsWith('blob:') || /[?&]download=true(?:&|$)/i.test(encoded)) {
        return encoded;
    }

    const opts = options || {};
    const params = new URLSearchParams();
    const width   = opts.width ?? opts.w;
    const height  = opts.height ?? opts.h;
    const quality = opts.quality ?? opts.q;
    const fit     = opts.fit;
    const blur    = opts.blur;
    const format  = opts.format !== undefined ? opts.format : (opts.fmt !== undefined ? opts.fmt : 'auto');

    if (Number.isFinite(Number(width)) && Number(width) > 0)     params.set('w', String(Math.round(Number(width))));
    if (Number.isFinite(Number(height)) && Number(height) > 0)   params.set('h', String(Math.round(Number(height))));
    if (Number.isFinite(Number(quality)) && Number(quality) > 0) params.set('q', String(Math.round(Number(quality))));
    if (fit)    params.set('fit', String(fit).trim());
    if (blur)   params.set('blur', String(Math.round(Number(blur))));
    if (format) params.set('fmt', String(format).trim());

    const qs = params.toString();
    if (!qs) return encoded;
    return `${encoded}${encoded.includes('?') ? '&' : '?'}${qs}`;
}

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

    const resolvedSrc = encodeImageUrlPath(trimmed);
    if (directives.length === 0) return resolvedSrc;

    const cleanTarget = resolvedSrc.startsWith('/') ? resolvedSrc.slice(1) : resolvedSrc;
    return `/cdn-cgi/image/${directives.join(',')}/${cleanTarget}`;
}

function getImageFallbackCandidates(rawUrl, options = {}, extraRawUrls = []) {
    const seen = new Set();
    const list = [];
    const add = (url) => {
        if (url && typeof url === 'string' && !seen.has(url)) {
            seen.add(url);
            list.push(url);
        }
    };

    const sources = [rawUrl, ...(Array.isArray(extraRawUrls) ? extraRawUrls : [])].filter(Boolean);
    for (const src of sources) {
        add(getCloudflareImageUrl(src, options));
        add(buildWorkerTransformUrl(src, options));
        add(encodeImageUrlPath(src));
    }
    return list;
}

function attachImageFallback(imgEl, candidates, { onLoadSuccess, onFinalError, fallbackSvg } = {}) {
    if (!imgEl) return '';
    const queue = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    let attempt = 0;

    imgEl.onload = function() {
        if (typeof onLoadSuccess === 'function') onLoadSuccess(this);
    };

    imgEl.onerror = function() {
        attempt++;
        if (attempt < queue.length) {
            this.src = queue[attempt];
            return;
        }
        this.onerror = null;
        if (typeof onFinalError === 'function') {
            onFinalError(this);
        } else if (fallbackSvg) {
            this.src = fallbackSvg;
        }
    };

    return queue[0] || fallbackSvg || '';
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

    encodeImageUrlPath(rawUrl) {
        return encodeImageUrlPath(rawUrl);
    },

    buildWorkerTransformUrl(rawUrl, options = {}) {
        return buildWorkerTransformUrl(rawUrl, options);
    },

    getCloudflareImageUrl(src, options) {
        return getCloudflareImageUrl(src, options);
    },

    // Alias kompatibilitas yang dipakai modul UI galeri untuk optimasi gambar.
    buildImageUrl(rawUrl, options = {}) {
        return getCloudflareImageUrl(rawUrl, options);
    },

    getImageFallbackCandidates(rawUrl, options = {}, extraRawUrls = []) {
        return getImageFallbackCandidates(rawUrl, options, extraRawUrls);
    },

    attachImageFallback(imgEl, candidates, hooks = {}) {
        return attachImageFallback(imgEl, candidates, hooks);
    },
};
