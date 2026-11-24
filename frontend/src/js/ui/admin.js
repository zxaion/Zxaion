/**
 * ui/admin.js — Private Admin Dashboard: revenue KPIs, PayPal orders breakdown,
 * user credits & recovery monitoring, and 1-click R2 force-rescan trigger.
 * Depends on: ui (base.js), state, elements, utils, API_BASE
 */

Object.assign(ui, {
    isAdminOpen() {
        return elements.adminSection && !elements.adminSection.classList.contains('hidden');
    },

    openAdminSection() {
        if (!elements.adminSection) return;

        // Hide public gallery views and hero
        if (elements.galleryContainer) elements.galleryContainer.classList.add('hidden');
        if (elements.animeCollections) elements.animeCollections.classList.add('hidden');
        if (elements.comitbaseSection) elements.comitbaseSection.classList.add('hidden');
        if (elements.dtreasureSection) elements.dtreasureSection.classList.add('hidden');
        if (elements.paginationContainer) elements.paginationContainer.classList.add('hidden');
        if (elements.infiniteLoadMore) elements.infiniteLoadMore.classList.add('hidden');
        if (elements.galleryToolbar) elements.galleryToolbar.classList.add('hidden');

        const rankingSection = document.getElementById('ranking-carousel-section');
        if (rankingSection) rankingSection.classList.add('hidden');

        const hero = document.getElementById('page-hero');
        if (hero) hero.classList.add('hidden');

        const categoryNav = document.querySelector('.category-nav') || document.getElementById('category-nav');
        if (categoryNav) categoryNav.classList.add('hidden');

        // Show admin container
        elements.adminSection.classList.remove('hidden');

        // Check token authentication
        if (state.adminToken) {
            elements.adminLoginView?.classList.add('hidden');
            elements.adminDashboardView?.classList.remove('hidden');
            this.fetchAdminDashboard();
        } else {
            elements.adminLoginView?.classList.remove('hidden');
            elements.adminDashboardView?.classList.add('hidden');
            if (elements.adminTokenInput) elements.adminTokenInput.value = '';
            if (elements.adminLoginError) elements.adminLoginError.classList.add('hidden');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    closeAdminSection() {
        if (!elements.adminSection) return;
        elements.adminSection.classList.add('hidden');

        const hero = document.getElementById('page-hero');
        if (hero) hero.classList.remove('hidden');

        const categoryNav = document.querySelector('.category-nav') || document.getElementById('category-nav');
        if (categoryNav) categoryNav.classList.remove('hidden');

        if (window.location.hash === '#admin') {
            try {
                history.replaceState(null, '', window.location.pathname);
            } catch (_) {}
        }

        ui.changeCategory(state.currentCategory || 'All', { scroll: false });
    },

    async loginAdmin(token) {
        const cleanToken = (token || '').trim();
        if (!cleanToken) {
            if (elements.adminLoginError) {
                elements.adminLoginError.textContent = 'Token admin tidak boleh kosong.';
                elements.adminLoginError.classList.remove('hidden');
            }
            return;
        }

        const loginBtn = elements.adminLoginForm?.querySelector('button[type="submit"]');
        const origText = loginBtn ? loginBtn.innerHTML : '';
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memvalidasi token...';
        }

        try {
            const url = `${API_BASE}/api/admin/dashboard`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-Admin-Token': cleanToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Akses ditolak (HTTP ${res.status})`);
            }

            const data = await res.json();
            state.adminToken = cleanToken;
            try {
                sessionStorage.setItem('zx_admin_token', cleanToken);
                localStorage.setItem('zx_admin_token', cleanToken);
            } catch (_) {}

            elements.adminLoginView?.classList.add('hidden');
            elements.adminDashboardView?.classList.remove('hidden');
            if (elements.adminLoginError) elements.adminLoginError.classList.add('hidden');

            this.renderAdminDashboard(data);
            this.showToast('Login admin berhasil!', 'success');
        } catch (err) {
            console.error('[Admin] Login error:', err);
            if (elements.adminLoginError) {
                elements.adminLoginError.textContent = err.message || 'Token tidak valid. Silakan coba lagi.';
                elements.adminLoginError.classList.remove('hidden');
            }
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = origText;
            }
        }
    },

    logoutAdmin() {
        state.adminToken = null;
        state.adminData = null;
        try {
            sessionStorage.removeItem('zx_admin_token');
            localStorage.removeItem('zx_admin_token');
        } catch (_) {}

        elements.adminDashboardView?.classList.add('hidden');
        elements.adminLoginView?.classList.remove('hidden');
        if (elements.adminTokenInput) elements.adminTokenInput.value = '';
        if (elements.adminLoginError) elements.adminLoginError.classList.add('hidden');

        this.showToast('Telah keluar dari admin portal.', 'info');
    },

    async fetchAdminDashboard() {
        if (!state.adminToken) return;

        const refreshBtn = elements.adminRefreshBtn;
        if (refreshBtn) refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="hidden sm:inline">Memuat...</span>';

        try {
            const url = `${API_BASE}/api/admin/dashboard`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-Admin-Token': state.adminToken,
                    'Content-Type': 'application/json',
                },
            });

            if (res.status === 401) {
                this.logoutAdmin();
                this.showToast('Sesi token admin telah kedaluwarsa. Silakan masukkan token kembali.', 'warning');
                return;
            }

            if (!res.ok) throw new Error(`HTTP error ${res.status}`);

            const data = await res.json();
            state.adminData = data;
            this.renderAdminDashboard(data);
        } catch (err) {
            console.error('[Admin] Fetch dashboard error:', err);
            this.showToast('Gagal memuat data dashboard: ' + err.message, 'error');
        } finally {
            if (refreshBtn) refreshBtn.innerHTML = '<i class="fas fa-rotate"></i> <span class="hidden sm:inline">Refresh</span>';
        }
    },

    async triggerAdminRescan() {
        if (!state.adminToken) {
            this.showToast('Token admin diperlukan untuk rescan.', 'warning');
            return;
        }

        const btn = elements.adminRescanBtn;
        const btnText = document.getElementById('admin-rescan-btn-text');
        const triggerLarge = document.getElementById('admin-rescan-trigger-large');

        if (btn) btn.disabled = true;
        if (triggerLarge) triggerLarge.disabled = true;
        if (btnText) btnText.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Rescanning R2...';

        try {
            const res = await fetch(`${API_BASE}/api/admin/rescan`, {
                method: 'POST',
                headers: {
                    'X-Admin-Token': state.adminToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const result = await res.json();
            const stats = result.stats || [];

            let totalUpserted = 0;
            let totalRemoved = 0;
            let totalImages = 0;
            stats.forEach(s => {
                totalUpserted += s.upserted || 0;
                totalRemoved += s.removed || 0;
                totalImages += s.scanned ?? s.totalInBucket ?? 0;
            });

            const alertEl = elements.adminRescanAlert;
            if (alertEl) {
                alertEl.className = 'p-4 rounded-2xl text-sm flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
                alertEl.innerHTML = `
                    <div class="flex items-center gap-2">
                        <i class="fas fa-check-circle text-emerald-500 text-lg"></i>
                        <div>
                            <div class="font-bold">Force-Rescan R2 Sukses!</div>
                            <div class="text-xs opacity-90">${totalUpserted} file baru/update, ${totalRemoved} file dihapus. Total saat ini: ${totalImages} gambar di database.</div>
                        </div>
                    </div>
                    <button type="button" class="text-xs font-bold underline ml-4" onclick="this.parentElement.classList.add('hidden')">Tutup</button>
                `;
                alertEl.classList.remove('hidden');
            }

            this.showToast(`R2 Rescan Berhasil: +${totalUpserted} baru, -${totalRemoved} hapus!`, 'success', 5000);

            // Reload admin metrics and public image cache
            await this.fetchAdminDashboard();
            api.fetchImages().catch(() => {});
        } catch (err) {
            console.error('[Admin] Rescan error:', err);
            const alertEl = elements.adminRescanAlert;
            if (alertEl) {
                alertEl.className = 'p-4 rounded-2xl text-sm flex items-center justify-between border bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
                alertEl.innerHTML = `
                    <div class="flex items-center gap-2">
                        <i class="fas fa-exclamation-triangle text-red-500 text-lg"></i>
                        <div>
                            <div class="font-bold">Gagal menjalankan force-rescan R2</div>
                            <div class="text-xs opacity-90">${utils.escapeHtml(err.message)}</div>
                        </div>
                    </div>
                    <button type="button" class="text-xs font-bold underline ml-4" onclick="this.parentElement.classList.add('hidden')">Tutup</button>
                `;
                alertEl.classList.remove('hidden');
            }
            this.showToast('Rescan gagal: ' + err.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
            if (triggerLarge) triggerLarge.disabled = false;
            if (btnText) btnText.innerHTML = '1-Klik Force-Rescan R2';
        }
    },

    switchAdminTab(tabName) {
        state.adminActiveTab = tabName;
        document.querySelectorAll('#admin-tab-bar .admin-tab-btn').forEach(btn => {
            const isMatch = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isMatch);
            btn.classList.toggle('bg-amber-500', isMatch);
            btn.classList.toggle('text-black', isMatch);
            btn.classList.toggle('bg-gray-100', !isMatch);
            btn.classList.toggle('dark:bg-gray-800', !isMatch);
            btn.classList.toggle('text-gray-700', !isMatch);
            btn.classList.toggle('dark:text-gray-300', !isMatch);
        });

        document.querySelectorAll('.admin-tab-panel').forEach(panel => {
            panel.classList.add('hidden');
        });

        const activePanel = document.getElementById(`admin-panel-${tabName}`);
        if (activePanel) activePanel.classList.remove('hidden');
    },

    renderAdminDashboard(data) {
        if (!data || !data.metrics) return;
        const m = data.metrics;
        const rev = m.revenue || {};
        const uSummary = m.usersSummary || {};
        const catalog = m.catalog || {};

        // 1. Header Timestamp
        const lastSyncEl = document.getElementById('admin-last-sync');
        if (lastSyncEl) {
            const timeStr = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
            lastSyncEl.textContent = `Sync: ${timeStr}`;
        }

        // 2. Metric Cards
        const revEl = document.getElementById('admin-metric-revenue');
        if (revEl) revEl.textContent = `$${(rev.totalGross || 0).toFixed(2)} USD`;

        const ordersRatioEl = document.getElementById('admin-metric-orders-ratio');
        if (ordersRatioEl) ordersRatioEl.textContent = `${rev.completedOrders || 0} sukses dari ${rev.totalOrders || 0} pesanan`;

        const bComp = document.getElementById('admin-badge-completed');
        if (bComp) bComp.textContent = `${rev.completedOrders || 0} Sukses`;
        const bProc = document.getElementById('admin-badge-processing');
        if (bProc) bProc.textContent = `${rev.processingOrders || 0} Proses`;
        const bFail = document.getElementById('admin-badge-failed');
        if (bFail) bFail.textContent = `${rev.failedOrders || 0} Gagal`;
        const bRef = document.getElementById('admin-badge-refunded');
        if (bRef) bRef.textContent = `${rev.refundedOrders || 0} Refund`;

        const totalOrdersEl = document.getElementById('admin-metric-total-orders');
        if (totalOrdersEl) totalOrdersEl.textContent = `Total ${rev.totalOrders || 0} transaksi`;

        const usersCountEl = document.getElementById('admin-metric-users-count');
        if (usersCountEl) usersCountEl.textContent = `${uSummary.totalUsers || 0} Akun`;

        const creditsSummaryEl = document.getElementById('admin-metric-credits-summary');
        if (creditsSummaryEl) {
            creditsSummaryEl.textContent = `${uSummary.totalCreditsCirculating || 0} kredit beredar • ${uSummary.totalLifetimeUsers || 0} Lifetime`;
        }

        const recoveryCountEl = document.getElementById('admin-metric-recovery-count');
        if (recoveryCountEl) recoveryCountEl.textContent = `${uSummary.totalRecoveryCodes || 0} Ter-Backup`;

        const catalogCountsEl = document.getElementById('admin-metric-catalog-counts');
        if (catalogCountsEl) {
            catalogCountsEl.textContent = `R2: ${catalog.main || 0} Main • ${catalog.comitbase || 0} Comit • ${catalog.dtreasure || 0} DT`;
        }

        // Catalog tab numbers
        const catMain = document.getElementById('admin-catalog-main');
        if (catMain) catMain.textContent = utils.formatNumber(catalog.main || 0);
        const catComit = document.getElementById('admin-catalog-comitbase');
        if (catComit) catComit.textContent = utils.formatNumber(catalog.comitbase || 0);
        const catDt = document.getElementById('admin-catalog-dtreasure');
        if (catDt) catDt.textContent = utils.formatNumber(catalog.dtreasure || 0);

        // Tab badge counters
        const tabCountOrders = document.getElementById('admin-tab-count-orders');
        if (tabCountOrders) tabCountOrders.textContent = (data.orders || []).length;
        const tabCountUsers = document.getElementById('admin-tab-count-users');
        if (tabCountUsers) tabCountUsers.textContent = (data.users || []).length;
        const usersTotalBadge = document.getElementById('admin-users-total-badge');
        if (usersTotalBadge) usersTotalBadge.textContent = `${(data.users || []).length} Terdaftar`;

        // 3. Render Orders Table
        this.renderAdminOrdersTable(data.orders || []);

        // 4. Render Users Table
        this.renderAdminUsersTable(data.users || []);

        // 5. Render Packs Breakdown Grid
        this.renderAdminPacksGrid(rev.packBreakdown || {});

        // Keep current active tab state
        this.switchAdminTab(state.adminActiveTab || 'orders');
    },

    renderAdminOrdersTable(orders) {
        const tbody = elements.adminOrdersTableBody || document.getElementById('admin-orders-table-body');
        if (!tbody) return;

        const query = (state.adminSearch || '').toLowerCase().trim();
        const filtered = query
            ? orders.filter(o =>
                (o.order_id && o.order_id.toLowerCase().includes(query)) ||
                (o.capture_id && o.capture_id.toLowerCase().includes(query)) ||
                (o.user_id && o.user_id.toLowerCase().includes(query)) ||
                (o.pack_key && o.pack_key.toLowerCase().includes(query)) ||
                (o.status && o.status.toLowerCase().includes(query))
            )
            : orders;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-gray-400 font-sans">
                        ${query ? 'Tidak ada pesanan yang cocok dengan pencarian.' : 'Belum ada data pesanan.'}
                    </td>
                </tr>
            `;
            return;
        }

        const statusBadges = {
            completed:  '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">COMPLETED</span>',
            processing: '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">PROCESSING</span>',
            created:    '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">CREATED</span>',
            failed:     '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">FAILED</span>',
            refunded:   '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">REFUNDED</span>',
        };

        tbody.innerHTML = filtered.map(o => {
            const badge = statusBadges[o.status] || `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">${utils.escapeHtml(o.status || 'unknown')}</span>`;
            const dateStr = o.created_at ? new Date(o.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-';
            const orderDisplay = o.order_id ? `${o.order_id.slice(0, 14)}...` : (o.id || '-');
            const userDisplay = o.user_id ? `${o.user_id.slice(0, 12)}...` : '-';
            const amountStr = `$${Number(o.amount || 0).toFixed(2)}`;
            const errStr = o.error_message ? `<span class="text-red-500 font-sans" title="${utils.escapeHtml(o.error_message)}">${utils.escapeHtml(o.error_message.slice(0, 30))}...</span>` : '<span class="text-gray-400 font-sans">-</span>';

            return `
                <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td class="p-3.5 font-bold text-gray-900 dark:text-white" title="${utils.escapeHtml(o.order_id || '')}">${utils.escapeHtml(orderDisplay)}</td>
                    <td class="p-3.5 text-gray-500 dark:text-gray-400" title="${utils.escapeHtml(o.user_id || '')}">${utils.escapeHtml(userDisplay)}</td>
                    <td class="p-3.5 font-sans font-bold text-amber-600 dark:text-amber-400">${utils.escapeHtml(o.pack_key || '-')}</td>
                    <td class="p-3.5 font-bold text-gray-900 dark:text-white">${amountStr}</td>
                    <td class="p-3.5 font-sans">${badge}</td>
                    <td class="p-3.5 text-gray-500 font-sans">${dateStr}</td>
                    <td class="p-3.5">${errStr}</td>
                </tr>
            `;
        }).join('');
    },

    renderAdminUsersTable(users) {
        const tbody = elements.adminUsersTableBody || document.getElementById('admin-users-table-body');
        if (!tbody) return;

        const query = (state.adminSearch || '').toLowerCase().trim();
        const filtered = query
            ? users.filter(u =>
                (u.user_id && u.user_id.toLowerCase().includes(query)) ||
                (u.public_id && u.public_id.toLowerCase().includes(query))
            )
            : users;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-gray-400 font-sans">
                        ${query ? 'Tidak ada akun yang cocok dengan pencarian.' : 'Belum ada pengguna terdaftar.'}
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(u => {
            const isLifetime = Boolean(u.lifetime);
            const vipBadge = isLifetime
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-600 dark:text-amber-300 border border-amber-400/30 font-sans"><i class="fas fa-crown text-[9px] mr-1"></i>LIFETIME VIP</span>'
                : '<span class="text-gray-400 font-sans text-xs">Standard</span>';

            const recoveryBadge = u.has_recovery
                ? '<span class="text-emerald-500 font-sans text-xs flex items-center gap-1"><i class="fas fa-circle-check"></i> Aktif</span>'
                : '<span class="text-gray-400 font-sans text-xs flex items-center gap-1"><i class="fas fa-circle-xmark"></i> Belum set</span>';

            const userTrunc = u.user_id ? `${u.user_id.slice(0, 16)}...` : '-';
            const publicTrunc = u.public_id ? `${u.public_id.slice(0, 14)}...` : '-';

            return `
                <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td class="p-3.5 font-bold text-gray-900 dark:text-white" title="${utils.escapeHtml(u.user_id || '')}">${utils.escapeHtml(userTrunc)}</td>
                    <td class="p-3.5 text-gray-500 dark:text-gray-400" title="${utils.escapeHtml(u.public_id || '')}">${utils.escapeHtml(publicTrunc)}</td>
                    <td class="p-3.5 font-bold text-amber-600 dark:text-amber-400">${utils.formatNumber(u.credits || 0)} Cr</td>
                    <td class="p-3.5">${vipBadge}</td>
                    <td class="p-3.5">${recoveryBadge}</td>
                    <td class="p-3.5 font-sans font-semibold">${u.purchased_count || 0} item</td>
                </tr>
            `;
        }).join('');
    },

    renderAdminPacksGrid(packBreakdown) {
        const grid = elements.adminPacksGrid || document.getElementById('admin-packs-grid');
        if (!grid) return;

        const packs = typeof CREDIT_PACKS !== 'undefined' ? CREDIT_PACKS : {};
        const packKeys = ['5$', '25$', '45$', '75$', '99$', '125$'];

        grid.innerHTML = packKeys.map(k => {
            const p = packs[k] || { label: k, price: 0, credits: 0 };
            const count = packBreakdown[k] || 0;
            const revenue = count * (p.price || 0);

            return `
                <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                    <div>
                        <div class="flex items-center gap-1.5">
                            <span class="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 uppercase">${p.label || k}</span>
                            <span class="text-xs font-bold text-gray-900 dark:text-white">$${p.price} USD</span>
                        </div>
                        <div class="text-xs text-gray-500 mt-1">${p.credits === 'lifetime' ? 'Unlimited Access' : `${p.credits} Credits`}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-black font-mono text-gray-900 dark:text-white">${count} terjual</div>
                        <div class="text-xs text-emerald-600 dark:text-emerald-400 font-bold font-mono">$${revenue.toFixed(2)}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    exportAdminOrdersCsv() {
        const orders = state.adminData?.orders || [];
        if (orders.length === 0) {
            this.showToast('Tidak ada data pesanan untuk diekspor.', 'info');
            return;
        }

        const headers = ['Order ID', 'Capture ID', 'User Token', 'Pack', 'Amount USD', 'Status', 'Created At', 'Error Message'];
        const rows = orders.map(o => [
            o.order_id || '',
            o.capture_id || '',
            o.user_id || '',
            o.pack_key || '',
            Number(o.amount || 0).toFixed(2),
            o.status || '',
            o.created_at || '',
            (o.error_message || '').replace(/"/g, '""'),
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(col => `"${col}"`).join(','))
        ].join('\r\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zxaion_paypal_orders_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        this.showToast('File CSV berhasil diunduh!', 'success');
    },
});
