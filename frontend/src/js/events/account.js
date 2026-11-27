/**
 * events/account.js — Event listeners for Virtual Account & Credit Wallet Dashboard.
 * Depends on: state, elements, ui, api
 */
function initAccountEvents() {
    document.getElementById('account-btn')?.addEventListener('click', () => {
        ui.openAccountModal('overview');
    });

    document.getElementById('close-account-modal')?.addEventListener('click', () => {
        ui.closeAccountModal();
    });

    document.getElementById('account-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'account-modal') ui.closeAccountModal();
    });

    document.getElementById('account-tab-bar')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.account-tab-btn');
        if (btn?.dataset.accountTab) {
            ui.switchAccountTab(btn.dataset.accountTab);
        }
    });

    document.getElementById('copy-account-id-btn')?.addEventListener('click', async () => {
        const acctId = state.account?.accountId;
        if (!acctId) return;
        try {
            await utils.copyText(acctId);
            ui.showToast(`Account ID ${acctId} copied!`, 'success');
        } catch {
            ui.showToast(`Account ID: ${acctId}`, 'info');
        }
    });

    document.getElementById('account-goto-register-btn')?.addEventListener('click', () => {
        ui.switchAccountTab('security');
        document.getElementById('reg-email')?.focus();
    });

    document.getElementById('account-buy-credits-shortcut')?.addEventListener('click', () => {
        ui.closeAccountModal();
        document.getElementById('buy-credits-btn')?.click();
    });

    document.getElementById('account-refresh-btn')?.addEventListener('click', () => {
        ui.refreshAccountModalData();
    });

    document.getElementById('account-ledger-filter')?.addEventListener('change', (e) => {
        state.accountLedgerFilter = e.target.value || '';
        ui.loadAccountLedger();
    });

    // Register & upgrade current Virtual Account
    document.getElementById('account-register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reg-email')?.value?.trim() || '';
        const displayName = document.getElementById('reg-display-name')?.value?.trim() || '';
        const password = document.getElementById('reg-password')?.value || '';
        const submitBtn = document.getElementById('account-register-submit');
        if (submitBtn) submitBtn.disabled = true;

        const res = await api.registerAccount({ email, password, displayName });
        if (submitBtn) submitBtn.disabled = false;

        if (!res.success) {
            ui.showToast(res.error || 'Registration failed', 'error');
            return;
        }

        const regForm = document.getElementById('account-register-form');
        regForm?.reset();

        const devHint = document.getElementById('account-dev-otp-hint');
        if (devHint) {
            if (res.verification?.devOtpPreview) {
                devHint.textContent = `Local Preview OTP: ${res.verification.devOtpPreview}`;
                devHint.classList.remove('hidden');
            } else {
                devHint.classList.add('hidden');
            }
        }

        ui.showToast(
            res.verification?.emailDispatched
                ? 'Account secured! A verification OTP code has been sent to your email.'
                : 'Account registered! Check your OTP preview or configure email delivery.',
            res.verification?.emailDispatched ? 'success' : 'warning',
            5000
        );
        ui.switchAccountTab('overview');
        ui.renderAccountDashboard();
    });

    // Resend verification OTP
    document.getElementById('account-resend-otp-btn')?.addEventListener('click', async () => {
        const res = await api.resendEmailVerification();
        const devHint = document.getElementById('account-dev-otp-hint');
        if (devHint && res.devOtpPreview) {
            devHint.textContent = `Local Preview OTP: ${res.devOtpPreview}`;
            devHint.classList.remove('hidden');
        }
        if (res.success) {
            ui.showToast('A new verification OTP code has been sent.', 'success');
        } else {
            ui.showToast(res.error || 'Failed to send OTP', 'error');
        }
    });

    // Daily check-in reward
    document.getElementById('account-checkin-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('account-checkin-btn');
        if (btn) btn.disabled = true;
        const res = await api.claimDailyCheckin();
        if (!res.success) {
            if (btn) btn.disabled = false;
            ui.showToast(res.error || 'Daily check-in failed', 'error');
            return;
        }
        if (res.alreadyClaimed) {
            ui.showToast('You already claimed today\'s daily check-in reward.', 'info');
        } else {
            const bonusText = res.bonusApplied ? ' (7-Day Milestone Bonus!)' : '';
            ui.showToast(`Daily check-in claimed: +${res.awarded || 2} Credits! Streak: ${res.streak || 1} day(s)${bonusText}`, 'success', 4500);
        }
        ui.renderAccountDashboard();
        if (state.accountActiveTab === 'history') {
            ui.loadAccountLedger();
        }
    });

    // Verify OTP
    document.getElementById('account-verify-otp-btn')?.addEventListener('click', async () => {
        const otpInput = document.getElementById('account-otp-input');
        const code = otpInput?.value?.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            ui.showToast('Please enter a 6-digit OTP code.', 'warning');
            otpInput?.focus();
            return;
        }
        const res = await api.verifyEmailOtp(code);
        if (!res.success) {
            ui.showToast(res.error || 'Invalid OTP code', 'error');
            return;
        }
        if (otpInput) otpInput.value = '';
        document.getElementById('account-dev-otp-hint')?.classList.add('hidden');
        const bonusMsg = res.bonusAwarded > 0
            ? `Email verified! +${res.bonusAwarded} Bonus Credits added to your wallet!`
            : 'Email verified successfully!';
        ui.showToast(bonusMsg, 'success', 4500);
        ui.renderAccountDashboard();
    });

    // Login
    document.getElementById('account-login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email')?.value?.trim() || '';
        const password = document.getElementById('login-password')?.value || '';
        const btn = document.getElementById('account-login-submit');
        if (btn) btn.disabled = true;

        const res = await api.loginAccount({ email, password });
        if (btn) btn.disabled = false;

        if (!res.success) {
            ui.showToast(res.error || 'Sign in failed', 'error');
            return;
        }
        document.getElementById('login-password').value = '';
        ui.showToast(`Welcome back (${res.account?.accountId || 'Wallet'})!`, 'success');
        await ui.refreshAccountModalData();
        ui.switchAccountTab('overview');
    });

    // Logout
    document.getElementById('account-logout-btn')?.addEventListener('click', async () => {
        await api.logoutAccount();
        ui.showToast('You have signed out of your account session.', 'info');
        await ui.refreshAccountModalData();
        ui.switchAccountTab('overview');
    });

    // Email Recovery: request OTP
    document.getElementById('account-recover-request-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('recover-email-input')?.value?.trim() || '';
        const res = await api.requestEmailRecovery(email);
        const devHint = document.getElementById('account-recover-dev-hint');
        if (devHint) {
            if (res.devOtpPreview) {
                devHint.textContent = `Local Preview Recovery OTP: ${res.devOtpPreview}`;
                devHint.classList.remove('hidden');
            } else {
                devHint.classList.add('hidden');
            }
        }
        if (res.success) {
            ui.showToast(res.message || 'Recovery code sent if the email is verified.', 'success');
        } else {
            ui.showToast(res.error || 'Failed to request recovery code', 'error');
        }
    });

    // Email Recovery: confirm OTP & new password
    document.getElementById('account-recover-confirm-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('recover-email-input')?.value?.trim() || '';
        const code = document.getElementById('recover-otp-input')?.value?.trim() || '';
        const newPassword = document.getElementById('recover-new-password')?.value || '';
        const res = await api.confirmEmailRecovery({ email, code, newPassword });
        if (!res.success) {
            ui.showToast(res.error || 'Account recovery failed', 'error');
            return;
        }
        document.getElementById('recover-otp-input').value = '';
        document.getElementById('recover-new-password').value = '';
        document.getElementById('account-recover-dev-hint')?.classList.add('hidden');
        ui.showToast('Account recovered and all previous sessions revoked!', 'success');
        await ui.refreshAccountModalData();
        ui.switchAccountTab('overview');
    });

    // Revoke single session via delegation
    document.getElementById('account-sessions-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-revoke-session]');
        if (!btn) return;
        const sessionId = btn.dataset.revokeSession;
        const res = await api.revokeAccountSession(sessionId);
        if (res.success) {
            ui.showToast('Device session revoked.', 'success');
            if (res.revokedCurrent) {
                await api.logoutAccount();
            }
            await ui.loadAccountSessions();
            ui.renderAccountDashboard();
        } else {
            ui.showToast(res.error || 'Failed to revoke session', 'error');
        }
    });

    // Revoke other sessions
    document.getElementById('account-revoke-others-btn')?.addEventListener('click', async () => {
        const res = await api.revokeOtherAccountSessions();
        if (res.success) {
            ui.showToast(`${res.revokedCount || 0} other session(s) revoked.`, 'success');
            await ui.loadAccountSessions();
        } else {
            ui.showToast(res.error || 'Failed to revoke other sessions', 'error');
        }
    });

    // Export wallet JSON backup
    document.getElementById('account-export-json-btn')?.addEventListener('click', async () => {
        const res = await api.downloadAccountBackupJson();
        if (res.success) {
            ui.showToast('Wallet backup (.json) downloaded!', 'success');
        } else {
            ui.showToast(res.error || 'Failed to export wallet backup', 'error');
        }
    });
}
