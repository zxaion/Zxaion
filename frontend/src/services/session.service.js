/**
 * Browser-local anonymous visitor token.
 * Storage key and token format intentionally match the previous implementation.
 */
export const getOrCreateUserToken = () => {
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
