/**
 * ui/modal.js — Image modal: shield proteksi DTREASURE, unlock thumbnail, buka modal gambar.
 * Depends on: ui (base.js), state, elements, api, utils, preventTouchSave
 */
Object.assign(ui, {
    applyModalShield(protect) {
        const shield = document.getElementById('modal-img-shield');
        const img    = elements.modalImg;
        if (!shield || !img) return;

        if (protect) {
            shield.classList.remove('hidden');
            img.oncontextmenu = (e) => e.preventDefault();
            img.ondragstart   = (e) => e.preventDefault();
            img.addEventListener('touchstart', preventTouchSave, { passive: false });
        } else {
            shield.classList.add('hidden');
            img.oncontextmenu = null;
            img.ondragstart   = null;
            img.removeEventListener('touchstart', preventTouchSave);
        }
    },

    unlockDtreasureThumbnail(photoId) {
        if (!photoId) return;
        const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(photoId) : photoId;
        const item = elements.dtreasureGallery?.querySelector(`.masonry-item[data-photo-id="${safeId}"]`);
        if (!item) return;

        const shield = item.querySelector('.dtreasure-thumb-shield');
        if (shield) shield.remove();

        const img = item.querySelector('img');
        if (img) {
            img.oncontextmenu = null;
            img.ondragstart   = null;
            img.removeEventListener('touchstart', preventTouchSave);
            img.style.removeProperty('-webkit-touch-callout');
        }

        const btn = item.querySelector('.download-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-download"></i> Download';
    },

    async openImageModal(photo) {
        if (!photo) return;

        state.currentImageId = photo.id;

        // Optimistic update (in-memory + DOM + server)
        photo.viewCount = (photo.viewCount || 0) + 1;
        api.recordView(photo.id);

        const displayViews     = photo.viewCount;
        const displayDownloads = photo.downloadCount || 0;

        const imageUrl   = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
        const previewUrl = utils.buildImageUrl(photo.url, {
            w:   isDtreasure ? 600 : 1400,
            q:   isDtreasure ? 75  : 85,
            fit: 'scale-down',
            fmt: 'auto',
        });

        elements.modalImg.classList.add('loading-shimmer');
        elements.modalImg.style.minHeight = '200px';
        elements.modalImg.src             = '';
        elements.modalImg.onerror         = null;
        elements.modalImg.onload          = null;

        const preload   = new Image();
        preload.onload  = () => {
            elements.modalImg.src = previewUrl;
            elements.modalImg.classList.remove('loading-shimmer');
            elements.modalImg.style.minHeight = '';
            preload.onload = null;
        };
        preload.onerror = () => {
            elements.modalImg.classList.remove('loading-shimmer');
            elements.modalImg.style.minHeight = '';
            elements.modalImg.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%231f2937" width="400" height="300"/%3E%3Ctext fill="%236b7280" font-family="sans-serif" font-size="18" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage unavailable%3C/text%3E%3C/svg%3E';
            preload.onerror = null;
        };
        preload.src = previewUrl;

        elements.modalTitle.textContent         = photo.title || 'Wallpaper';
        elements.modalCategory.textContent      = `${photo.category || photo.searchCategory || ''}${photo.subCategory ? ' / ' + photo.subCategory : ''}`;
        elements.modalViewCount.textContent     = utils.formatNumber(displayViews);
        elements.modalDownloadCount.textContent = utils.formatNumber(displayDownloads);

        const isPurchased = state.lifetime || state.purchasedImages.has(photo.id);

        this.applyModalShield(isDtreasure && !isPurchased);

        if (isDtreasure) {
            if (isPurchased) {
                // Use X-User-Token header via ui.triggerDownload instead of leaking token in URL query
                elements.downloadBtn.removeAttribute('href');
                elements.downloadBtn.removeAttribute('download');
                elements.downloadBtn.onclick = (e) => {
                    e.preventDefault();
                    ui.triggerDownload(photo);
                };
                elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
            } else {
                elements.downloadBtn.removeAttribute('href');
                elements.downloadBtn.removeAttribute('download');
                elements.downloadBtn.onclick = (e) => { e.preventDefault(); ui.handleDownload(photo); };
                elements.downloadBtn.innerHTML = '<i class="fas fa-lock mr-2"></i>10 Credits to Download';
            }
        } else {
            elements.downloadBtn.href     = imageUrl + '?download=true';
            elements.downloadBtn.download = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_');
            elements.downloadBtn.onclick  = () => {
                photo.downloadCount = (photo.downloadCount || 0) + 1;
                api.recordDownload(photo.id);
                const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(photo.id) : photo.id;
                document.querySelectorAll(`.download-count[data-id="${safeId}"]`).forEach(el => {
                    el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
                });
                if (elements.modalDownloadCount) {
                    elements.modalDownloadCount.textContent = utils.formatNumber(photo.downloadCount);
                }
            };
            elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
        }

        elements.imageModal.classList.remove('hidden');
        elements.imageModal.classList.add('flex');

        document.body.style.overflow = 'hidden';
    },
});
