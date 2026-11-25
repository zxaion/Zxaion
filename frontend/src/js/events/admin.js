/**
 * events/admin.js — Event listeners untuk Admin Portal:
 * login, logout, 1-klik R2 rescan, tab switching, search filter, export CSV.
 * Depends on: ui (base.js, admin.js), state, elements
 */

function initAdminEvents() {
    // 1. Admin Login Form Submission
    elements.adminLoginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const token = elements.adminTokenInput?.value || '';
        ui.loginAdmin(token);
    });

    // 2. Toggle Password / Token Visibility
    document.getElementById('admin-toggle-token-visibility')?.addEventListener('click', () => {
        const input = elements.adminTokenInput || document.getElementById('admin-token-input');
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        const icon = document.querySelector('#admin-toggle-token-visibility i');
        if (icon) {
            icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
        }
    });

    // 3. Back / Exit Admin Portal
    document.getElementById('admin-login-back-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        ui.closeAdminSection();
    });

    elements.adminExitBtn?.addEventListener('click', () => {
        ui.closeAdminSection();
    });

    // 4. Logout Admin
    elements.adminLogoutBtn?.addEventListener('click', () => {
        ui.logoutAdmin();
    });

    // 5. 1-Click Force-Rescan R2 Trigger Buttons
    elements.adminRescanBtn?.addEventListener('click', () => {
        ui.triggerAdminRescan();
    });

    document.getElementById('admin-rescan-trigger-large')?.addEventListener('click', () => {
        ui.triggerAdminRescan();
    });

    // 6. Refresh Data Button
    elements.adminRefreshBtn?.addEventListener('click', () => {
        ui.fetchAdminDashboard();
    });

    // 7. Tab Switching
    document.getElementById('admin-tab-bar')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.admin-tab-btn');
        if (btn && btn.dataset.tab) {
            ui.switchAdminTab(btn.dataset.tab);
        }
    });

    // 8. Search Input in Admin Dashboard (Orders & Users)
    const searchInput = elements.adminSearchInput || document.getElementById('admin-search-input');
    const searchClear = elements.adminSearchClear || document.getElementById('admin-search-clear');

    searchInput?.addEventListener('input', (e) => {
        state.adminSearch = e.target.value || '';
        searchClear?.classList.toggle('hidden', !state.adminSearch);

        if (state.adminData) {
            ui.renderAdminOrdersTable(state.adminData.orders || []);
            ui.renderAdminUsersTable(state.adminData.users || []);
        }
    });

    searchClear?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        state.adminSearch = '';
        searchClear.classList.add('hidden');
        if (state.adminData) {
            ui.renderAdminOrdersTable(state.adminData.orders || []);
            ui.renderAdminUsersTable(state.adminData.users || []);
        }
    });

    // 9. Export Orders to CSV
    document.getElementById('admin-export-orders-btn')?.addEventListener('click', () => {
        ui.exportAdminOrdersCsv();
    });

    // 10. Footer Admin Link Click
    document.getElementById('footer-admin-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = '#admin';
        ui.openAdminSection();
    });

    // 11. Admin Backup Snapshot, Download & Restore
    document.getElementById('admin-backup-create-btn')?.addEventListener('click', () => {
        ui.createAdminBackupSnapshot?.();
    });

    document.getElementById('admin-backup-download-btn')?.addEventListener('click', () => {
        ui.downloadAdminBackupSnapshot?.('');
    });

    document.getElementById('admin-snapshots-list')?.addEventListener('click', (e) => {
        const dlBtn = e.target.closest('[data-admin-download-snap]');
        if (dlBtn) {
            ui.downloadAdminBackupSnapshot?.(dlBtn.dataset.adminDownloadSnap);
            return;
        }
        const restoreBtn = e.target.closest('[data-admin-restore-snap]');
        if (restoreBtn) {
            ui.restoreAdminBackupPayload?.({ snapshotId: restoreBtn.dataset.adminRestoreSnap });
        }
    });

    document.getElementById('admin-backup-restore-btn')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('admin-backup-restore-file');
        const file = fileInput?.files?.[0];
        if (!file) {
            ui.showToast('Please select a JSON snapshot file first.', 'warning');
            return;
        }
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            await ui.restoreAdminBackupPayload?.({ snapshot: parsed });
            fileInput.value = '';
        } catch {
            ui.showToast('Invalid JSON snapshot file format.', 'error');
        }
    });
}
