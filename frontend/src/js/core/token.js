/**
 * core/token.js — Token perangkat (X-User-Token) & Session Token (Bearer) untuk Virtual Account.
 * Depends on: (tidak ada)
 */
// --- User Token & Session Token ---
const getOrCreateUserToken = () => {
    let token = localStorage.getItem('zx_user_token');
    if (!token) {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        const randomHex = Array.from(array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        token = 'u_' + Date.now().toString(36) + '_' + randomHex;
        localStorage.setItem('zx_user_token', token);
    }
    return token;
};

const getSessionToken = () => {
    try {
        return sessionStorage.getItem('zx_session_token') || localStorage.getItem('zx_session_token') || null;
    } catch {
        return null;
    }
};

const setSessionToken = (sessionToken) => {
    try {
        if (sessionToken) {
            sessionStorage.setItem('zx_session_token', sessionToken);
            localStorage.setItem('zx_session_token', sessionToken);
        } else {
            sessionStorage.removeItem('zx_session_token');
            localStorage.removeItem('zx_session_token');
        }
    } catch {}
};

const getAuthHeaders = (extra = {}) => {
    const headers = {
        'X-User-Token': getOrCreateUserToken(),
        ...extra,
    };
    const sid = getSessionToken();
    if (sid) {
        headers['Authorization'] = `Bearer ${sid}`;
    }
    return headers;
};

async function getPublicPayerRef() {
    const token = getOrCreateUserToken();
    const data = new TextEncoder().encode(`zxaion-payer-v1:${token}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
    return `pub_${hex}`;
}
