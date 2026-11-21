/**
 * core/token.js — Token user anonim (localStorage) untuk header X-User-Token.
 * Depends on: (tidak ada)
 */
// --- User Token ---
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
