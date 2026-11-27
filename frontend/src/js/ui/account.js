/**
 * ui/account.js — Simple User Account & Credit Wallet Dashboard UI.
 * Depends on: ui (base.js), state, elements, utils, api
 */
Object.assign(ui, {
    updateAccountBanner() {
        const acct = state.account;
        const accountId = acct?.accountId || (state.requiresLogin ? 'Login Required' : 'ZXA-....-....');

        if (elements.accountIdBadge) {
            elements.accountIdBadge.textContent = accountId;
        }

        const buyModalIdEl = document.getElementById('buy-credits-account-id');
        if (buyModalIdEl) {
            buyModalIdEl.textContent = accountId;
        }

        const buyModalVerifiedEl = document.getElementById('buy-credits-account-verified');
        if (buyModalVerifiedEl) {
            if (state.requiresLogin) {
                buyModalVerifiedEl.textContent = '(Sign In Required)';
            } else if (acct?.emailVerified) {
                buyModalVerifiedEl.textContent = '• Email Verified';
            } else if (acct?.hasPassword) {
                buyModalVerifiedEl.textContent = '• Email Unverified';
            } else {
                buyModalVerifiedEl.textContent = '• Auto Account';
            }
        }

        const navLabel = document.getElementById('nav-account-label');
        if (navLabel) {
            navLabel.textContent = acct?.hasPassword ? 'ACCOUNT' : 'WALLET';
        }
    },

    openAccountModal(initialTab = 'overview') {
        const modal = this.setModalOpen(elements.accountModal || 'account-modal', true);
        if (!modal) return;

        this.switchAccountTab(state.requiresLogin ? 'security' : initialTab);
        this.renderAccountDashboard();
        this.refreshAccountModalData();
    },

    closeAccountModal() {
        this.setModalOpen(elements.accountModal || 'account-modal', false);
    },

    switchAccountTab(tabName) {
        state.accountActiveTab = tabName || 'overview';
        document.querySelectorAll('#account-tab-bar .account-tab-btn').forEach((btn) => {
            const isMatch = btn.dataset.accountTab === state.accountActiveTab;
            btn.classList.toggle('bg-amber-500', isMatch);
            btn.classList.toggle('text-gray-950', isMatch);
            btn.classList.toggle('bg-white/10', !isMatch);
            btn.classList.toggle('text-gray-200', !isMatch);
        });

        document.querySelectorAll('.account-tab-panel').forEach((panel) => {
            panel.classList.add('hidden');
        });
        const target = document.getElementById(`account-panel-${state.accountActiveTab}`);
        if (target) target.classList.remove('hidden');

        if (state.accountActiveTab === 'history') {
            this.loadAccountLedger();
        } else if (state.accountActiveTab === 'sessions') {
            this.loadAccountSessions();
        }
    },

    async refreshAccountModalData() {
        if (state.requiresLogin) {
            this.renderAccountDashboard();
            return;
        }
        await api.ensureAutoAccount();
        await api.fetchAccountProfile();
        this.renderAccountDashboard();
        if (state.accountActiveTab === 'history') {
            await this.loadAccountLedger();
        } else if (state.accountActiveTab === 'sessions') {
            await this.loadAccountSessions();
        }
    },

    renderAccountDashboard() {
        const acct = state.account;
        this.updateAccountBanner();

        const loginAlert = document.getElementById('account-requires-login-alert');
        if (loginAlert) loginAlert.classList.toggle('hidden', !state.requiresLogin);

        const headerCredits = document.getElementById('account-header-credits');
        if (headerCredits) {
            headerCredits.textContent = state.lifetime ? '∞ VIP' : utils.formatNumber(state.credits || 0);
        }

        const statusBadge = document.getElementById('account-status-badge');
        if (statusBadge) {
            if (state.requiresLogin) {
                statusBadge.textContent = 'Locked (Sign In)';
            } else if (acct?.emailVerified) {
                statusBadge.textContent = 'Verified Account';
            } else if (acct?.hasPassword) {
                statusBadge.textContent = 'Registered (Unverified)';
            } else {
                statusBadge.textContent = 'Auto Guest';
            }
        }

        const ovCredits = document.getElementById('account-overview-credits');
        if (ovCredits) ovCredits.textContent = state.lifetime ? '∞' : utils.formatNumber(state.credits || 0);

        const ovTier = document.getElementById('account-overview-tier');
        if (ovTier) ovTier.textContent = state.lifetime ? 'Lifetime VIP' : 'Standard Wallet';

        const ovUnlocked = document.getElementById('account-overview-unlocked');
        if (ovUnlocked) ovUnlocked.textContent = utils.formatNumber(state.purchasedImages?.size || 0);

        const checkinCard = document.getElementById('account-checkin-card');
        if (checkinCard) {
            checkinCard.classList.toggle('hidden', Boolean(state.requiresLogin));
            const streak = Number(acct?.checkinStreak || 0);
            const checkedToday = Boolean(acct?.checkedInToday);
            const streakBadge = document.getElementById('account-checkin-streak-badge');
            const checkinStatus = document.getElementById('account-checkin-status');
            const checkinBtn = document.getElementById('account-checkin-btn');
            const dotsEl = document.getElementById('account-checkin-dots');

            if (streakBadge) {
                streakBadge.textContent = `${streak} Day${streak === 1 ? '' : 's'} Streak`;
            }
            if (checkinStatus) {
                const mod = streak % 7;
                const daysUntilBonus = mod === 0 && streak > 0 ? 7 : 7 - mod;
                checkinStatus.textContent = checkedToday
                    ? `Checked in today! Come back tomorrow (${daysUntilBonus} day${daysUntilBonus === 1 ? '' : 's'} until +7 Cr milestone).`
                    : (mod === 6
                        ? 'Today completes your 7-day streak! Claim +7 Bonus Credits today.'
                        : 'Claim +2 free credits today, plus +5 extra on every 7th streak day!');
            }
            if (checkinBtn) {
                checkinBtn.disabled = checkedToday || Boolean(state.requiresLogin);
                checkinBtn.innerHTML = checkedToday
                    ? '<i class="fas fa-check mr-1.5" aria-hidden="true"></i><span>Checked In Today</span>'
                    : '<i class="fas fa-gift mr-1.5" aria-hidden="true"></i><span>Claim Daily +2 Cr</span>';
            }
            if (dotsEl) {
                const filledCount = streak === 0 ? 0 : ((streak - 1) % 7) + 1;
                dotsEl.innerHTML = Array.from({ length: 7 }, (_, i) => {
                    const dayNum = i + 1;
                    const isFilled = i < filledCount;
                    const isMilestone = dayNum === 7;
                    return `<div class="text-center py-1.5 rounded-lg text-[10px] font-bold border ${
                        isFilled
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : (isMilestone
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/50'
                                : 'bg-white/70 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 border-emerald-200/70 dark:border-emerald-800/50')
                    }">${isMilestone ? 'D7 +7' : `D${dayNum}`}</div>`;
                }).join('');
            }
        }

        const verifyCard = document.getElementById('account-verify-email-card');
        const verifyTarget = document.getElementById('account-verify-email-target');
        if (verifyCard) {
            const needsVerify = Boolean(acct && acct.email && !acct.emailVerified && !state.requiresLogin);
            verifyCard.classList.toggle('hidden', !needsVerify);
            if (verifyTarget && acct?.email) verifyTarget.textContent = acct.email;
        }

        const guestUpgrade = document.getElementById('account-guest-upgrade-card');
        if (guestUpgrade) {
            guestUpgrade.classList.toggle('hidden', Boolean(acct?.hasPassword || state.requiresLogin));
        }

        const signedInSummary = document.getElementById('account-signedin-summary');
        const signedInEmail = document.getElementById('account-signedin-email');
        const regForm = document.getElementById('account-register-form');
        const loginForm = document.getElementById('account-login-form');

        if (acct?.hasPassword && !state.requiresLogin) {
            signedInSummary?.classList.remove('hidden');
            if (signedInEmail) {
                signedInEmail.textContent = `${acct.email || ''} (${acct.emailVerified ? 'Email Verified' : 'Unverified'})`;
            }
            regForm?.classList.add('hidden');
            loginForm?.classList.add('hidden');
        } else {
            signedInSummary?.classList.add('hidden');
            regForm?.classList.toggle('hidden', !!state.requiresLogin);
            loginForm?.classList.remove('hidden');
        }

        this.renderAccountLedgerList();
    },

    async loadAccountLedger() {
        if (state.requiresLogin) return;
        await api.fetchAccountLedger(state.accountLedgerFilter || '', 100);
        this.renderAccountLedgerList();
    },

    renderAccountLedgerList() {
        const container = document.getElementById('account-ledger-list');
        if (!container) return;

        const entries = state.accountLedger || [];
        if (entries.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-xs text-gray-400">No credit transactions recorded in ledger yet.</div>';
            return;
        }

        container.innerHTML = entries.map((entry) => {
            const amt = Number(entry.amount || 0);
            const isPositive = amt > 0;
            const signText = amt === 0 ? '0 Cr' : `${isPositive ? '+' : ''}${utils.formatNumber(amt)} Cr`;
            const amtColor = amt > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : (amt < 0 ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400');
            const dateStr = entry.created_at
                ? new Date(entry.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
                : '-';

            return `
                <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200">${utils.escapeHtml(entry.tx_type || 'tx')}</span>
                            <span class="text-[11px] text-gray-400 font-mono truncate">${utils.escapeHtml(entry.reference_id || '')}</span>
                        </div>
                        <div class="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-1 truncate">${utils.escapeHtml(entry.description || '-')}</div>
                        <div class="text-[11px] text-gray-400 mt-0.5">${utils.escapeHtml(dateStr)}</div>
                    </div>
                    <div class="text-right shrink-0 font-mono">
                        <div class="text-sm font-black ${amtColor}">${signText}</div>
                        <div class="text-[10px] text-gray-400">Balance: ${utils.formatNumber(entry.balance_after || 0)}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async loadAccountSessions() {
        if (state.requiresLogin) return;
        await api.fetchAccountSessions();
        this.renderAccountSessionsList();
    },

    renderAccountSessionsList() {
        const container = document.getElementById('account-sessions-list');
        if (!container) return;

        const sessions = state.accountSessions || [];
        if (sessions.length === 0) {
            container.innerHTML = '<div class="text-xs text-gray-400 py-5 text-center">No authenticated sign-in sessions yet (Auto Guest mode active).</div>';
            return;
        }

        container.innerHTML = sessions.map((s) => {
            const lastSeen = s.last_seen_at ? new Date(s.last_seen_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '-';
            const ua = (s.user_agent || 'Browser Device').slice(0, 64);
            return `
                <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-gray-900 dark:text-white truncate">${utils.escapeHtml(ua)}</span>
                            ${s.isCurrent ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">This Session</span>' : ''}
                        </div>
                        <div class="text-[11px] text-gray-400 mt-0.5 font-mono">Active: ${utils.escapeHtml(lastSeen)}</div>
                    </div>
                    <button type="button" data-revoke-session="${utils.escapeHtml(s.session_id)}" class="shrink-0 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-900/50 dark:text-red-400 text-xs font-bold transition-colors">
                        Revoke
                    </button>
                </div>
            `;
        }).join('');
    },
});
