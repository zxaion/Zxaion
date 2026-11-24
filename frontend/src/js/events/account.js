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
            await navigator.clipboard.writeText(acctId);
            ui.showToast(`Account ID ${acctId} disalin!`, 'success');
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
            ui.showToast(res.error || 'Pendaftaran gagal', 'error');
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
                ? 'Akun diamankan! Kode OTP telah dikirim ke email Anda.'
                : 'Akun terdaftar! Silakan cek kode OTP atau hubungi admin jika email belum terkonfigurasi.',
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
            ui.showToast('Kode verifikasi OTP baru telah dibuat.', 'success');
        } else {
            ui.showToast(res.error || 'Gagal mengirim OTP', 'error');
        }
    });

    // Verify OTP
    document.getElementById('account-verify-otp-btn')?.addEventListener('click', async () => {
        const otpInput = document.getElementById('account-otp-input');
        const code = otpInput?.value?.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            ui.showToast('Masukkan 6 digit kode OTP.', 'warning');
            otpInput?.focus();
            return;
        }
        const res = await api.verifyEmailOtp(code);
        if (!res.success) {
            ui.showToast(res.error || 'Kode OTP tidak valid', 'error');
            return;
        }
        if (otpInput) otpInput.value = '';
        document.getElementById('account-dev-otp-hint')?.classList.add('hidden');
        ui.showToast('Email berhasil diverifikasi!', 'success');
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
            ui.showToast(res.error || 'Login gagal', 'error');
            return;
        }
        document.getElementById('login-password').value = '';
        ui.showToast(`Selamat datang kembali (${res.account?.accountId || 'Wallet'})!`, 'success');
        await ui.refreshAccountModalData();
        ui.switchAccountTab('overview');
    });

    // Logout
    document.getElementById('account-logout-btn')?.addEventListener('click', async () => {
        await api.logoutAccount();
        ui.showToast('Anda telah keluar dari sesi akun.', 'info');
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
            ui.showToast(res.message || 'Kode pemulihan telah dikirim jika email terverifikasi.', 'success');
        } else {
            ui.showToast(res.error || 'Gagal meminta kode pemulihan', 'error');
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
            ui.showToast(res.error || 'Pemulihan akun gagal', 'error');
            return;
        }
        document.getElementById('recover-otp-input').value = '';
        document.getElementById('recover-new-password').value = '';
        document.getElementById('account-recover-dev-hint')?.classList.add('hidden');
        ui.showToast('Akun berhasil dipulihkan & semua sesi lama dicabut!', 'success');
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
            ui.showToast('Sesi perangkat dicabut.', 'success');
            if (res.revokedCurrent) {
                await api.logoutAccount();
            }
            await ui.loadAccountSessions();
            ui.renderAccountDashboard();
        } else {
            ui.showToast(res.error || 'Gagal mencabut sesi', 'error');
        }
    });

    // Revoke other sessions
    document.getElementById('account-revoke-others-btn')?.addEventListener('click', async () => {
        const res = await api.revokeOtherAccountSessions();
        if (res.success) {
            ui.showToast(`${res.revokedCount || 0} sesi lain berhasil dicabut.`, 'success');
            await ui.loadAccountSessions();
        } else {
            ui.showToast(res.error || 'Gagal mencabut sesi lain', 'error');
        }
    });

    // Export wallet JSON backup
    document.getElementById('account-export-json-btn')?.addEventListener('click', async () => {
        const res = await api.downloadAccountBackupJson();
        if (res.success) {
            ui.showToast('Backup wallet (.json) berhasil diunduh!', 'success');
        } else {
            ui.showToast(res.error || 'Gagal mengekspor backup wallet', 'error');
        }
    });
}
