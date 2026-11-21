/**
 * ui/download.js — Alur download: cek kredit/pembelian DTREASURE + trigger unduhan file.
 * Depends on: ui (base.js), state, api, utils, API_BASE, getOrCreateUserToken
 */
Object.assign(ui, {
    async handleDownload(photo) {
        if (!photo) return;

        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';

        if (isDtreasure) {
            if (state.lifetime || state.purchasedImages.has(photo.id)) {
                this.triggerDownload(photo);
                return;
            }

            if (state.credits < 10) {
                this.showToast(`Insufficient credits (Need: 10, Have: ${state.credits}). Please buy more credits.`, 'warning');
                document.getElementById('buy-credits-btn')?.click();
                return;
            }

            const result = await api.spendCredit(photo.id);
            if (result.success) {
                state.credits = result.newBalance;
                state.purchasedImages.add(photo.id);
                ui.updateCreditDisplay();

                if (state.currentImageId === photo.id) {
                    this.applyModalShield(false);
                    elements.downloadBtn.removeAttribute('href');
                    elements.downloadBtn.removeAttribute('download');
                    elements.downloadBtn.onclick = (e) => {
                        e.preventDefault();
                        ui.triggerDownload(photo);
                    };
                    elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
                }

                this.unlockDtreasureThumbnail(photo.id);
                if (typeof this.updateDtreasureTabCounts === 'function') this.updateDtreasureTabCounts();
                if (state.currentCategory === 'DTREASURE') this.renderDtreasureGallery();
                this.triggerDownload(photo);
            } else {
                this.showToast(result.error || 'Download failed. Please try again.', 'error');
            }
        } else {
            this.triggerDownload(photo);
        }
    },

    async triggerDownload(photo) {
        if (!photo || !photo.url) return;

        const markDownloaded = () => {
            photo.downloadCount = (photo.downloadCount || 0) + 1;
            api.recordDownload(photo.id);
            const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(photo.id) : photo.id;
            document.querySelectorAll(`.download-count[data-id="${safeId}"]`).forEach(el => {
                el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
            });
            if (state.currentImageId === photo.id && elements.modalDownloadCount) {
                elements.modalDownloadCount.textContent = utils.formatNumber(photo.downloadCount);
            }
        };

        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
        const fullUrl     = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
        const downloadUrl = `${fullUrl}?download=true&photoId=${encodeURIComponent(photo.id)}`;
        const filename    = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + '.jpg';

        if (isDtreasure) {
            const token        = getOrCreateUserToken();
            const loadingToast = document.createElement('div');
            loadingToast.id    = 'dl-toast';
            loadingToast.className = 'fixed bottom-6 right-6 z-[9999] bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2';
            loadingToast.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing download...';
            document.body.appendChild(loadingToast);

            try {
                const res = await fetch(downloadUrl, {
                    method:  'GET',
                    headers: { 'X-User-Token': token },
                });

                if (!res.ok) {
                    let errMsg = `Download failed (HTTP ${res.status})`;
                    try { const err = await res.json(); errMsg = err.error || errMsg; } catch (_) {}
                    throw new Error(errMsg);
                }

                const blob      = await res.blob();
                const objectUrl = URL.createObjectURL(blob);
                const a         = document.createElement('a');
                a.href          = objectUrl;
                a.download      = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

                markDownloaded();

                loadingToast.innerHTML = '<i class="fas fa-check-circle text-green-400"></i> Download started!';
                loadingToast.classList.add('bg-green-800');

            } catch (error) {
                console.error('DTREASURE download error:', error);
                loadingToast.innerHTML = `<i class="fas fa-times-circle text-red-400"></i> ${utils.escapeHtml(error.message || 'Download error')}`;
                loadingToast.classList.add('bg-red-800');
                if ((error.message || '').includes('403') || (error.message || '').toLowerCase().includes('purchase required')) {
                    setTimeout(() => {
                        this.showToast('Download blocked: Purchase required. Buy credits to download DTREASURE images.', 'warning');
                        document.getElementById('buy-credits-btn')?.click();
                    }, 500);
                }
            } finally {
                setTimeout(() => { document.getElementById('dl-toast')?.remove(); }, 3500);
            }
        } else {
            markDownloaded();
            const a    = document.createElement('a');
            a.href     = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { if (document.body.contains(a)) document.body.removeChild(a); }, 300);
        }
    },
});
