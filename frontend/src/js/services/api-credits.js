/**
 * services/api-credits.js — Menambah api: saldo kredit, pembelian kredit, belanja kredit, backup/restore token.
 * Depends on: api (api-gallery.js), API_BASE, state, ui, getOrCreateUserToken
 */
Object.assign(api, {
    _applyWalletState({
        requiresLogin = false,
        account = null,
        wallet = null,
        refreshSearch = false,
        refreshBanner = true,
    } = {}) {
        state.requiresLogin = Boolean(requiresLogin);
        if (account) {
            state.account = { ...(state.account || {}), ...account };
        }
        if (wallet) {
            state.credits         = wallet.credits || 0;
            state.lifetime        = Boolean(wallet.lifetime);
            state.purchasedImages = new Set(wallet.purchased || []);
        }
        ui.updateCreditDisplay?.();
        if (refreshBanner) ui.updateAccountBanner?.();

        if (state.currentCategory === 'DTREASURE' && typeof ui.renderDtreasureGallery === 'function') {
            ui.invalidateDtreasureSortCache?.();
            ui.renderDtreasureGallery();
        } else if (refreshSearch && state.searchQuery && typeof ui.renderGallery === 'function') {
            ui.renderGallery();
        }
        if (state.currentImageId && state.currentPhoto && typeof ui.refreshModalLockState === 'function') {
            ui.refreshModalLockState(state.currentPhoto);
        }
    },

    async fetchCreditBalance() {
        try {
            const res   = await fetch(`${API_BASE}/api/credits/balance`, {
                credentials: 'same-origin',
                headers: getAuthHeaders(),
            });
            if (!res.ok) { console.error('fetchCreditBalance failed:', res.status); return; }
            const data = await res.json();
            this._applyWalletState({
                requiresLogin: !!data.requiresLogin,
                account: data.accountId ? {
                    accountId:     data.accountId,
                    email:         data.email ?? state.account?.email ?? null,
                    emailVerified: data.emailVerified ?? state.account?.emailVerified ?? false,
                    hasPassword:   data.hasPassword ?? state.account?.hasPassword ?? false,
                } : null,
                wallet: {
                    credits:   data.credits || 0,
                    lifetime:  data.lifetime || false,
                    purchased: data.purchased || [],
                },
                refreshSearch: true,
            });
        } catch (e) {
            console.error('Failed to fetch credits:', e);
        }
    },

    async createOrder(packKey) {
        try {
            const res = await fetch(`${API_BASE}/api/credits/create-order`, {
                method:  'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body:    JSON.stringify({ pack: packKey })
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401 && data.requiresLogin) {
                state.requiresLogin = true;
                ui.openAccountModal?.('security');
            }
            if (res.ok && data.success && typeof data.orderId === 'string' && data.orderId.trim()) {
                if (data.accountId) {
                    state.account = { ...(state.account || {}), accountId: data.accountId };
                    ui.updateAccountBanner?.();
                }
                return { success: true, orderId: data.orderId.trim(), accountId: data.accountId || null, error: null };
            }
            return { success: false, orderId: null, error: data.error || 'Could not initialize secure checkout.' };
        } catch (e) {
            console.error('createOrder failed:', e);
            return { success: false, orderId: null, error: 'Network error while initializing PayPal checkout.' };
        }
    },

    async purchaseCredits(packKey, orderId) {
        try {
            const res  = await fetch(`${API_BASE}/api/credits/purchase`, {
                method:  'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body:    JSON.stringify({ pack: packKey, orderId })
            });
            const data = await res.json();

            if (res.ok && data.success === true) {
                return { success: true, newBalance: data.newBalance ?? 0, lifetime: data.lifetime ?? false, accountId: data.accountId || null, error: null };
            } else if (data.message === 'Order already processed') {
                return { success: true, newBalance: data.newBalance ?? 0, lifetime: data.lifetime ?? false, accountId: data.accountId || null, error: null };
            } else {
                return { success: false, error: data.error || 'Payment verification failed', orderId: data.orderId || orderId, newBalance: 0, lifetime: false };
            }
        } catch (e) {
            console.error('purchaseCredits network error:', e);
            return { success: false, error: 'Network error. Please check your connection.', newBalance: 0, lifetime: false };
        }
    },

    async spendCredit(photoId) {
        try {
            const res = await fetch(`${API_BASE}/api/credits/spend`, {
                method:  'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body:    JSON.stringify({ photoId })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                if (res.status === 401 && err.requiresLogin) {
                    state.requiresLogin = true;
                    ui.openAccountModal?.('security');
                }
                return { success: false, error: err.error || 'Spend credit failed' };
            }
            return res.json();
        } catch (e) {
            console.error('spendCredit network error:', e);
            return { success: false, error: 'Network error. Please check your connection.' };
        }
    },

    async generateRecoveryCode() {
        try {
            const res = await fetch(`${API_BASE}/api/credits/recovery`, {
                method:  'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                return { success: false, error: data.error || 'Failed to generate recovery code' };
            }
            return { success: true, recoveryCode: data.recoveryCode, accountId: data.accountId || null };
        } catch (e) {
            console.error('generateRecoveryCode network error:', e);
            return { success: false, error: 'Network error. Please check your connection.' };
        }
    },

    async recoverAccount(recoveryCode) {
        try {
            const res = await fetch(`${API_BASE}/api/credits/recover`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ recoveryCode: String(recoveryCode || '').trim().toUpperCase() })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success || !data.userToken) {
                return { success: false, error: data.error || 'Recovery code not found' };
            }

            localStorage.setItem('zx_user_token', data.userToken);
            ui.invalidateDtreasureSortCache?.();
            this._applyWalletState({
                requiresLogin: false,
                wallet: {
                    credits:   data.credits || 0,
                    lifetime:  data.lifetime || false,
                    purchased: data.purchased || [],
                },
                refreshBanner: false,
            });

            if (state.currentImageId && (state.lifetime || state.purchasedImages.has(state.currentImageId))) {
                ui.unlockDtreasureThumbnail?.(state.currentImageId);
            }

            return {
                success:   true,
                credits:   state.credits,
                lifetime:  state.lifetime,
                purchased: data.purchased || [],
            };
        } catch (e) {
            console.error('recoverAccount network error:', e);
            return { success: false, error: 'Network error. Please check your connection.' };
        }
    },
});
