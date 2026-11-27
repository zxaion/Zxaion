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
    const rerenderAdminTables = () => {
        if (!state.adminData) return;
        ui.renderAdminOrdersTable(state.adminData.orders || []);
        ui.renderAdminUsersTable(state.adminData.users || []);
    };

    searchInput?.addEventListener('input', (e) => {
        state.adminSearch = e.target.value || '';
        searchClear?.classList.toggle('hidden', !state.adminSearch);
        rerenderAdminTables();
    });

    searchClear?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        state.adminSearch = '';
        searchClear.classList.add('hidden');
        rerenderAdminTables();
    });

    // 9. Export Orders to CSV
    document.getElementById('admin-export-orders-btn')?.addEventListener('click', () => {
        ui.exportAdminOrdersCsv();
    });

    // 10. Admin Backup Snapshot, Download & Restore
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

    // 11. Admin Credit & VIP Adjustment Modal
    document.getElementById('admin-users-table-body')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-admin-edit-user]');
        if (btn && btn.dataset.adminEditUser) {
            ui.openAdminCreditModal?.(btn.dataset.adminEditUser);
        }
    });

    document.getElementById('admin-credit-close')?.addEventListener('click', () => ui.closeAdminCreditModal?.());
    document.getElementById('admin-credit-cancel')?.addEventListener('click', () => ui.closeAdminCreditModal?.());
    document.getElementById('admin-credit-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'admin-credit-modal') ui.closeAdminCreditModal?.();
    });
    document.getElementById('admin-credit-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        ui.submitAdminCreditAdjustment?.();
    });

    // 12. Admin Direct Media Upload Form
    const uploadBucketSelect = document.getElementById('admin-upload-bucket');
    const uploadMainFields = document.getElementById('admin-upload-main-fields');
    const uploadDtNote = document.getElementById('admin-upload-dt-note');
    const uploadFileInput = document.getElementById('admin-upload-file');
    const uploadPreview = document.getElementById('admin-upload-preview');
    const uploadPlaceholder = document.getElementById('admin-upload-placeholder');
    const uploadDims = document.getElementById('admin-upload-dims');
    let adminUploadDataUrl = '';

    const syncUploadBucketFields = () => {
        const b = uploadBucketSelect?.value || 'main';
        uploadMainFields?.classList.toggle('hidden', b !== 'main');
        uploadDtNote?.classList.toggle('hidden', b !== 'dtreasure');
    };
    uploadBucketSelect?.addEventListener('change', syncUploadBucketFields);
    syncUploadBucketFields();

    uploadFileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        adminUploadDataUrl = '';
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
            ui.showToast('File size exceeds 8 MB limit.', 'warning');
            uploadFileInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            if (!result.startsWith('data:image/')) {
                ui.showToast('Unsupported image file.', 'error');
                return;
            }
            adminUploadDataUrl = result;
            if (uploadPreview) {
                uploadPreview.onload = () => {
                    if (uploadDims && uploadPreview.naturalWidth > 0) {
                        uploadDims.textContent = `${file.name} · ${uploadPreview.naturalWidth} × ${uploadPreview.naturalHeight} px`;
                    }
                };
                uploadPreview.src = result;
                uploadPreview.classList.remove('hidden');
            }
            uploadPlaceholder?.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('admin-upload-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!adminUploadDataUrl) {
            ui.showToast('Please select an image file first.', 'warning');
            return;
        }
        const bucket = uploadBucketSelect?.value || 'main';
        const category = document.getElementById('admin-upload-category')?.value || 'ANIME';
        const subCategory = document.getElementById('admin-upload-subcategory')?.value?.trim() || '';
        const title = document.getElementById('admin-upload-title')?.value?.trim() || '';

        const res = await ui.submitAdminMediaUpload?.({
            bucket,
            category,
            subCategory,
            title,
            imageData: adminUploadDataUrl,
        });
        if (res && res.success) {
            adminUploadDataUrl = '';
            e.target.reset();
            syncUploadBucketFields();
            if (uploadPreview) {
                uploadPreview.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                uploadPreview.classList.add('hidden');
            }
            uploadPlaceholder?.classList.remove('hidden');
            if (uploadDims) uploadDims.textContent = 'Width & height are extracted automatically';
        }
    });
}
