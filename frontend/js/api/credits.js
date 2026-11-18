// frontend/js/api/credits.js
// API kredit: saldo, pembelian, dan pemakaian kredit
import { api } from './index.js';
import { API_BASE } from '../config/constants.js';
import { state } from '../state/appState.js';
import { ui } from '../ui/index.js';
import { getOrCreateUserToken } from '../utils/token.js';

Object.assign(api, {
    async fetchCreditBalance() {
        try {
            const token = getOrCreateUserToken();
            const res   = await fetch(`${API_BASE}/api/credits/balance`, {
                headers: { 'X-User-Token': token }
            });
            if (!res.ok) { console.error('fetchCreditBalance failed:', res.status); return; }
            const data = await res.json();
            state.credits        = data.credits  || 0;
            state.lifetime       = data.lifetime || false;
            state.purchasedImages = new Set(data.purchased || []);
            ui.updateCreditDisplay();
        } catch (e) {
            console.error('Failed to fetch credits:', e);
        }
    },

    async purchaseCredits(packKey, orderId) {
        const token = getOrCreateUserToken();
        try {
            const res  = await fetch(`${API_BASE}/api/credits/purchase`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
                body:    JSON.stringify({ pack: packKey, orderId })
            });
            const data = await res.json();

            if (res.ok && data.success === true) {
                return { success: true, newBalance: data.newBalance ?? 0, lifetime: data.lifetime ?? false, error: null };
            } else if (data.message === 'Order already processed') {
                return { success: true, newBalance: data.newBalance ?? 0, lifetime: data.lifetime ?? false, error: null };
            } else {
                return { success: false, error: data.error || 'Payment verification failed', orderId: data.orderId || orderId, newBalance: 0, lifetime: false };
            }
        } catch (e) {
            console.error('purchaseCredits network error:', e);
            return { success: false, error: 'Network error. Please check your connection.', newBalance: 0, lifetime: false };
        }
    },

    async spendCredit(photoId) {
        const token = getOrCreateUserToken();
        try {
            const res = await fetch(`${API_BASE}/api/credits/spend`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
                body:    JSON.stringify({ photoId })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                return { success: false, error: err.error || 'Spend credit failed' };
            }
            return res.json();
        } catch (e) {
            console.error('spendCredit network error:', e);
            return { success: false, error: 'Network error. Please check your connection.' };
        }
    },
});
