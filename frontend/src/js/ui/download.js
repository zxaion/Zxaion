/**
 * ui/download.js — Alur download: cek kredit/pembelian DTREASURE + trigger unduhan file.
 * Depends on: ui (base.js), state, api, utils, API_BASE, getOrCreateUserToken
 */
Object.assign(ui, {
    _spendingPhotoIds: new Set(),

    async handleDownload(photo) {
        if (!photo) return;

        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';

        if (isDtreasure) {
            if (state.lifetime || state.purchasedImages.has(photo.id)) {
                this.triggerDownload(photo);
                return;
            }

            if (this._spendingPhotoIds.has(photo.id)) return;

            if (state.credits < 10) {
                this.showToast(`Insufficient credits (Need: 10, Have: ${state.credits}). Please buy more credits.`, 'warning');
                document.getElementById('buy-credits-btn')?.click();
                return;
            }

            this._spendingPhotoIds.add(photo.id);
            let result;
            try {
                result = await api.spendCredit(photo.id);
            } finally {
                this._spendingPhotoIds.delete(photo.id);
            }

            if (result && result.success) {
                state.credits = result.newBalance;
                state.purchasedImages.add(photo.id);
                ui.updateCreditDisplay();

                this.unlockDtreasureThumbnail(photo.id);
                if (typeof this.updateDtreasureTabCounts === 'function') this.updateDtreasureTabCounts();
                if (state.currentCategory === 'DTREASURE') this.renderDtreasureGallery();
                this.triggerDownload(photo);
            } else {
                this.showToast(result?.error || 'Download failed. Please try again.', 'error');
            }
        } else {
            this.triggerDownload(photo);
        }
    },

    selectResolution(resolutionKey) {
        const preset = RESOLUTION_PRESETS[resolutionKey] || RESOLUTION_PRESETS.original;
        state.selectedResolution = preset.key;

        // Update active styling in modal button group
        document.querySelectorAll('.resolution-btn').forEach(btn => {
            const isMatch = btn.dataset.resolution === preset.key;
            btn.classList.toggle('active', isMatch);
            btn.classList.toggle('border-amber-500', isMatch);
            btn.classList.toggle('bg-amber-500/10', isMatch);
            btn.classList.toggle('border-gray-200', !isMatch);
            btn.classList.toggle('dark:border-gray-700', !isMatch);
            btn.classList.toggle('bg-white', !isMatch);
            btn.classList.toggle('dark:bg-gray-800', !isMatch);

            let check = btn.querySelector('.resolution-check');
            if (isMatch && !check) {
                const header = btn.querySelector('.flex.items-center.justify-between') || btn.querySelector('.font-bold');
                if (header) {
                    const i = document.createElement('i');
                    i.className = 'fas fa-check-circle text-amber-500 text-xs resolution-check ml-1';
                    header.appendChild(i);
                }
            } else if (!isMatch && check) {
                check.remove();
            }
        });

        const badge = document.getElementById('resolution-current-badge') || elements.resolutionBadge;
        if (badge) {
            badge.textContent = preset.key === 'original' ? 'Original / 4K' : preset.tag;
        }

        const desc = document.getElementById('resolution-desc-text') || elements.resolutionDescText;
        if (desc) {
            desc.textContent = preset.desc;
        }

        const dlBtn = elements.downloadBtn || document.getElementById('download-btn');
        if (dlBtn && !dlBtn.querySelector('.fa-lock')) {
            dlBtn.innerHTML = preset.key === 'original'
                ? '<i class="fas fa-download"></i><span>Download</span>'
                : `<i class="fas fa-download"></i><span class="text-sm whitespace-nowrap">Download (${preset.tag})</span>`;
        }
    },

    async triggerDownload(photo) {
        if (!photo || !photo.url) return;

        const presetKey = state.selectedResolution || 'original';
        const preset = RESOLUTION_PRESETS[presetKey];

        if (preset && preset.width && preset.height) {
            return this.triggerResolutionDownload(photo, preset);
        }

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
        const fullUrl     = utils.encodeImageUrlPath(photo.url).split('?')[0];
        const downloadUrl = `${fullUrl}?download=true`;
        const extMatch    = fullUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i);
        const ext         = extMatch ? `.${extMatch[1].toLowerCase()}` : '.jpg';
        const filename    = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + ext;

        if (isDtreasure) {
            const loadingToast = document.createElement('div');
            loadingToast.id    = 'dl-toast';
            loadingToast.className = 'fixed bottom-6 right-6 z-[9999] bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2';
            loadingToast.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing download...';
            document.body.appendChild(loadingToast);

            try {
                const res = await fetch(downloadUrl, {
                    method:  'GET',
                    credentials: 'same-origin',
                    headers: getAuthHeaders(),
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

    async triggerResolutionDownload(photo, preset) {
        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
        const fullUrl     = utils.encodeImageUrlPath(photo.url).split('?')[0];
        const downloadUrl = `${fullUrl}?download=true`;
        const filename    = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + `_${preset.tag}.jpg`;

        const loadingToast = document.createElement('div');
        loadingToast.id    = 'dl-toast';
        loadingToast.className = 'fixed bottom-6 right-6 z-[9999] bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2';
        loadingToast.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Preparing ${preset.tag} resolution...`;
        document.body.appendChild(loadingToast);

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

        try {
            let imageBlob = null;
            if (isDtreasure) {
                const res = await fetch(downloadUrl, {
                    method: 'GET',
                    credentials: 'same-origin',
                    headers: getAuthHeaders(),
                });
                if (!res.ok) {
                    let errMsg = `Download failed (HTTP ${res.status})`;
                    try { const err = await res.json(); errMsg = err.error || errMsg; } catch (_) {}
                    throw new Error(errMsg);
                }
                imageBlob = await res.blob();
            } else {
                const res = await fetch(downloadUrl);
                if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                imageBlob = await res.blob();
            }

            const img = new Image();
            const blobUrl = URL.createObjectURL(imageBlob);

            await new Promise((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to process image for the selected resolution'));
                img.src = blobUrl;
            });

            // Offscreen Canvas Crop / Fit to requested resolution
            const canvas = document.createElement('canvas');
            canvas.width = preset.width;
            canvas.height = preset.height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const targetRatio = canvas.width / canvas.height;
            const sourceRatio = img.naturalWidth / img.naturalHeight;
            let sw, sh, sx, sy;

            if (sourceRatio > targetRatio) {
                sh = img.naturalHeight;
                sw = img.naturalHeight * targetRatio;
                sx = (img.naturalWidth - sw) / 2;
                sy = 0;
            } else {
                sw = img.naturalWidth;
                sh = img.naturalWidth / targetRatio;
                sx = 0;
                sy = (img.naturalHeight - sh) / 2;
            }

            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(blobUrl);

            const resizedBlob = await new Promise((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95);
            });

            if (!resizedBlob) throw new Error('Failed to export selected resolution');

            const dlUrl = URL.createObjectURL(resizedBlob);
            const a = document.createElement('a');
            a.href = dlUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);

            markDownloaded();
            loadingToast.innerHTML = `<i class="fas fa-check-circle text-green-400"></i> ${preset.tag} download ready!`;
            loadingToast.classList.add('bg-green-800');
        } catch (err) {
            console.error('Resolution download error:', err);
            loadingToast.innerHTML = `<i class="fas fa-times-circle text-red-400"></i> ${utils.escapeHtml(err.message || 'Failed to process resolution')}`;
            loadingToast.classList.add('bg-red-800');
        } finally {
            setTimeout(() => { document.getElementById('dl-toast')?.remove(); }, 3500);
        }
    },
});
