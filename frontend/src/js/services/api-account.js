/**
 * services/api-account.js — Virtual Account API: auto-provision Account ID, register,
 * email OTP verification, login, email recovery, immutable ledger, sessions & personal backup export.
 * Depends on: api (api-gallery.js), API_BASE, state, ui, getAuthHeaders, setSessionToken
 */
Object.assign(api, {
    async ensureAutoAccount() {
        try {
            const res = await fetch(`${API_BASE}/api/account/auto`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401 && data.requiresLogin) {
                state.requiresLogin = true;
                state.account = null;
                state.credits = 0;
                state.lifetime = false;
                ui.updateCreditDisplay?.();
                ui.updateAccountBanner?.();
                return { success: false, requiresLogin: true, error: data.error };
            }
            if (res.ok && data.success) {
                state.account = data.account || null;
                this._applyWalletState({
                    requiresLogin: false,
                    wallet: data.wallet || null,
                });
                return data;
            }
            return { success: false, error: data.error || 'Failed to provision account' };
        } catch (err) {
            console.error('ensureAutoAccount error:', err);
            return { success: false, error: 'Network error' };
        }
    },

    async fetchAccountProfile() {
        try {
            const res = await fetch(`${API_BASE}/api/account/me`, {
                credentials: 'same-origin',
                headers: getAuthHeaders(),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401 && data.requiresLogin) {
                state.requiresLogin = true;
                state.account = null;
                return { success: false, requiresLogin: true, error: data.error };
            }
            if (!res.ok || !data.success) {
                return { success: false, error: data.error || 'Failed to load profile' };
            }
            state.account = data.account || null;
            state.accountLedger = data.recentLedger || [];
            state.accountOrders = data.recentOrders || [];
            this._applyWalletState({
                requiresLogin: false,
                wallet: data.wallet || null,
            });
            return data;
        } catch (err) {
            console.error('fetchAccountProfile error:', err);
            return { success: false, error: 'Network error' };
        }
    },

    async registerAccount({ email, password, displayName }) {
        try {
            const res = await fetch(`${API_BASE}/api/account/register`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ email, password, displayName }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                return { success: false, error: data.error || 'Registration failed' };
            }
            if (data.sessionToken) setSessionToken(data.sessionToken);
            state.requiresLogin = false;
            state.account = data.account || null;
            if (data.wallet) {
                state.credits = data.wallet.credits || 0;
                state.lifetime = !!data.wallet.lifetime;
                state.purchasedImages = new Set(data.wallet.purchased || []);
            }
            ui.updateCreditDisplay?.();
            ui.updateAccountBanner?.();
            return data;
        } catch (err) {
            console.error('registerAccount error:', err);
            return { success: false, error: 'Network error' };
        }
    },

    async resendEmailVerification() {
        try {
            const res = await fetch(`${API_BASE}/api/account/resend-verification`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            });
            return await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
        } catch (err) {
            return { success: false, error: 'Network error' };
        }
    },

    async verifyEmailOtp(code) {
        try {
            const res = await fetch(`${API_BASE}/api/account/verify-email`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ code }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                if (data.account) state.account = data.account;
                if (data.wallet) {
                    this._applyWalletState({ requiresLogin: false, wallet: data.wallet });
                } else {
                    ui.updateAccountBanner?.();
                }
            }
            return data;
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async claimDailyCheckin() {
        try {
            const res = await fetch(`${API_BASE}/api/account/checkin`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                if (data.account) state.account = data.account;
                if (data.wallet) {
                    this._applyWalletState({ requiresLogin: false, wallet: data.wallet });
                } else {
                    ui.updateAccountBanner?.();
                }
            }
            return data;
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async loginAccount({ email, password }) {
        try {
            const res = await fetch(`${API_BASE}/api/account/login`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                return { success: false, error: data.error || 'Invalid credentials' };
            }
            if (data.userToken) localStorage.setItem('zx_user_token', data.userToken);
            if (data.sessionToken) setSessionToken(data.sessionToken);
            state.account = data.account || null;
            ui.invalidateDtreasureSortCache?.();
            this._applyWalletState({
                requiresLogin: false,
                wallet: data.wallet || null,
                refreshSearch: true,
            });
            return data;
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async logoutAccount() {
        try {
            await fetch(`${API_BASE}/api/account/logout`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders(),
            });
        } catch {}
        setSessionToken(null);
        // Generate a fresh local guest token so logged-out browser doesn't stay stuck on protected user_id
        localStorage.removeItem('zx_user_token');
        getOrCreateUserToken();
        state.account = null;
        state.accountLedger = [];
        state.accountOrders = [];
        state.accountSessions = [];
        state.credits = 0;
        state.lifetime = false;
        state.purchasedImages = new Set();
        state.requiresLogin = false;
        ui.updateCreditDisplay?.();
        await this.ensureAutoAccount();
        return { success: true };
    },

    async requestEmailRecovery(email) {
        try {
            const res = await fetch(`${API_BASE}/api/account/recover/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            return await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async confirmEmailRecovery({ email, code, newPassword }) {
        try {
            const res = await fetch(`${API_BASE}/api/account/recover/confirm`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                if (data.userToken) localStorage.setItem('zx_user_token', data.userToken);
                if (data.sessionToken) setSessionToken(data.sessionToken);
                state.account = data.account || null;
                ui.invalidateDtreasureSortCache?.();
                this._applyWalletState({
                    requiresLogin: false,
                    wallet: data.wallet || null,
                });
            }
            return data;
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async fetchAccountLedger(txType = '', limit = 100) {
        try {
            const qs = new URLSearchParams({ limit: String(limit) });
            if (txType) qs.set('type', txType);
            const res = await fetch(`${API_BASE}/api/account/ledger?${qs.toString()}`, {
                credentials: 'same-origin',
                headers: getAuthHeaders(),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                state.accountLedger = data.entries || [];
            }
            return data;
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async fetchAccountSessions() {
        try {
            const res = await fetch(`${API_BASE}/api/account/sessions`, {
                credentials: 'same-origin',
                headers: getAuthHeaders(),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                state.accountSessions = data.sessions || [];
            }
            return data;
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async revokeAccountSession(sessionId) {
        try {
            const res = await fetch(`${API_BASE}/api/account/sessions/revoke`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ sessionId }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success && data.revokedCurrent) {
                setSessionToken(null);
            }
            return data;
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async revokeOtherAccountSessions() {
        try {
            const res = await fetch(`${API_BASE}/api/account/sessions/revoke-others`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            });
            return await res.json().catch(() => ({ success: false }));
        } catch {
            return { success: false, error: 'Network error' };
        }
    },

    async downloadAccountBackupJson() {
        try {
            const res = await fetch(`${API_BASE}/api/account/export`, {
                credentials: 'same-origin',
                headers: getAuthHeaders(),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return { success: false, error: err.error || `HTTP ${res.status}` };
            }
            const blob = await res.blob();
            utils.downloadBlob(blob, `zxaion-wallet-${state.account?.accountId || 'backup'}.json`, 4000);
            return { success: true };
        } catch {
            return { success: false, error: 'Network error' };
        }
    },
});
