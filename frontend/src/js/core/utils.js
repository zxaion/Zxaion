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

let _cdnCgiDisabled = false;

function shouldUseCdnCgiImage() {
    if (typeof window === 'undefined') return true;
    if (_cdnCgiDisabled) return false;
    const host = window.location?.hostname || '';
    if (
        !host ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.run.app') ||
        host.endsWith('.workers.dev')
    ) {
        return false;
    }
    return true;
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

    const useCdnCgi = shouldUseCdnCgiImage();
    const sources = [rawUrl, ...(Array.isArray(extraRawUrls) ? extraRawUrls : [])].filter(Boolean);
    for (const src of sources) {
        if (useCdnCgi) {
            add(getCloudflareImageUrl(src, options));
        }
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
        const failedUrl = queue[attempt] || this.src || '';
        if (typeof failedUrl === 'string' && failedUrl.includes('/cdn-cgi/image/')) {
            _cdnCgiDisabled = true;
        }
        attempt++;
        while (attempt < queue.length && _cdnCgiDisabled && queue[attempt].includes('/cdn-cgi/image/')) {
            attempt++;
        }
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

    const startIdx = (_cdnCgiDisabled && queue[0]?.includes('/cdn-cgi/image/') && queue.length > 1)
        ? queue.findIndex(u => !u.includes('/cdn-cgi/image/'))
        : 0;
    attempt = startIdx >= 0 ? startIdx : 0;
    return queue[attempt] || fallbackSvg || '';
}

const _authImageSeq      = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _trackedBlobUrls   = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _authBlobCache     = new Map();
const _authBlobInflight  = new Map();
const _AUTH_BLOB_MAX     = 48;

function clearAuthenticatedImageCache() {
    _authBlobCache.clear();
    _authBlobInflight.clear();
}

function _cacheAuthBlob(cacheKey, blob) {
    if (!cacheKey || !blob) return;
    if (_authBlobCache.has(cacheKey)) {
        _authBlobCache.delete(cacheKey);
    } else if (_authBlobCache.size >= _AUTH_BLOB_MAX) {
        const oldest = _authBlobCache.keys().next().value;
        if (oldest !== undefined) _authBlobCache.delete(oldest);
    }
    _authBlobCache.set(cacheKey, blob);
}

function revokeTrackedBlobUrl(imgEl) {
    if (!imgEl || !_trackedBlobUrls) return;
    const prev = _trackedBlobUrls.get(imgEl);
    if (prev && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(prev); } catch (_) {}
    }
    _trackedBlobUrls.delete(imgEl);
}

function getAuthenticatedImageCandidates(rawUrl, options = {}) {
    const seen = new Set();
    const list = [];
    const add = (url) => {
        if (url && typeof url === 'string' && !seen.has(url)) {
            seen.add(url);
            list.push(url);
        }
    };
    add(buildWorkerTransformUrl(rawUrl, options));
    add(encodeImageUrlPath(rawUrl));
    return list;
}

async function _fetchAuthBlobCached(candidateUrl, headers) {
    const tokenKey = headers['X-User-Token'] || headers['Authorization'] || 'session';
    const cacheKey = `${tokenKey}::${candidateUrl}`;

    if (_authBlobCache.has(cacheKey)) {
        const cachedBlob = _authBlobCache.get(cacheKey);
        // Refresh LRU order
        _authBlobCache.delete(cacheKey);
        _authBlobCache.set(cacheKey, cachedBlob);
        return cachedBlob;
    }

    if (_authBlobInflight.has(cacheKey)) {
        return _authBlobInflight.get(cacheKey);
    }

    const promise = (async () => {
        const res = await fetch(candidateUrl, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers,
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob || blob.size === 0) return null;
        _cacheAuthBlob(cacheKey, blob);
        return blob;
    })().finally(() => {
        _authBlobInflight.delete(cacheKey);
    });

    _authBlobInflight.set(cacheKey, promise);
    return promise;
}

async function loadAuthenticatedImage(imgEl, rawUrl, options = {}, { onLoadSuccess, onFinalError, fallbackSvg } = {}) {
    if (!imgEl) return;
    const seq = (_authImageSeq?.get(imgEl) || 0) + 1;
    if (_authImageSeq) _authImageSeq.set(imgEl, seq);

    const candidates = getAuthenticatedImageCandidates(rawUrl, options);
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};

    imgEl.onload = null;
    imgEl.onerror = null;

    for (const candidateUrl of candidates) {
        if (_authImageSeq && _authImageSeq.get(imgEl) !== seq) return;
        try {
            const blob = await _fetchAuthBlobCached(candidateUrl, headers);
            if (!blob) continue;

            if (_authImageSeq && _authImageSeq.get(imgEl) !== seq) return;

            const objectUrl = URL.createObjectURL(blob);
            const prevBlobUrl = _trackedBlobUrls?.get(imgEl);
            if (_trackedBlobUrls) _trackedBlobUrls.set(imgEl, objectUrl);

            imgEl.onload = function() {
                if (prevBlobUrl && prevBlobUrl !== objectUrl) {
                    try { URL.revokeObjectURL(prevBlobUrl); } catch (_) {}
                }
                if (_authImageSeq && _authImageSeq.get(imgEl) !== seq) return;
                if (typeof onLoadSuccess === 'function') onLoadSuccess(this);
            };
            imgEl.onerror = function() {
                if (prevBlobUrl && prevBlobUrl !== objectUrl) {
                    try { URL.revokeObjectURL(prevBlobUrl); } catch (_) {}
                }
                if (_authImageSeq && _authImageSeq.get(imgEl) !== seq) return;
                this.onerror = null;
                if (typeof onFinalError === 'function') {
                    onFinalError(this);
                } else if (fallbackSvg) {
                    this.src = fallbackSvg;
                }
            };
            imgEl.src = objectUrl;
            return;
        } catch (_) {
            // Try next candidate URL
        }
    }

    if (_authImageSeq && _authImageSeq.get(imgEl) !== seq) return;
    if (typeof onFinalError === 'function') {
        onFinalError(imgEl);
    } else if (fallbackSvg) {
        imgEl.src = fallbackSvg;
    }
}

if (typeof window !== 'undefined') {
    window.getCloudflareImageUrl = getCloudflareImageUrl;
}

// --- Utility Functions ---
const utils = {
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    normalizeAlbumKey(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[-_.]+/g, ' ')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
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

    getImageFallbackCandidates(rawUrl, options = {}, extraRawUrls = []) {
        return getImageFallbackCandidates(rawUrl, options, extraRawUrls);
    },

    attachImageFallback(imgEl, candidates, hooks = {}) {
        return attachImageFallback(imgEl, candidates, hooks);
    },

    getAuthenticatedImageCandidates(rawUrl, options = {}) {
        return getAuthenticatedImageCandidates(rawUrl, options);
    },

    loadAuthenticatedImage(imgEl, rawUrl, options = {}, hooks = {}) {
        return loadAuthenticatedImage(imgEl, rawUrl, options, hooks);
    },

    clearAuthenticatedImageCache() {
        return clearAuthenticatedImageCache();
    },

    revokeTrackedBlobUrl(imgEl) {
        return revokeTrackedBlobUrl(imgEl);
    },

    downloadBlob(blob, filename, revokeMs = 4000) {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objectUrl), revokeMs);
    },

    async copyText(text) {
        const value = String(text ?? '');
        if (!value) throw new Error('Nothing to copy');
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return;
        }
        const temp = document.createElement('textarea');
        temp.value = value;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(temp);
        if (!ok) throw new Error('Clipboard copy failed');
    },
};
