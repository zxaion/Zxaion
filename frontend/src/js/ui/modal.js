/**
 * ui/modal.js — Image modal: shield proteksi DTREASURE, unlock thumbnail, buka modal gambar.
 * Depends on: ui (base.js), state, elements, api, ads, utils, preventTouchSave
 */
Object.assign(ui, {
    // Shield: protect=true → aktifkan (belum purchase), false → nonaktifkan
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
        const item = elements.dtreasureGallery?.querySelector(`.masonry-item[data-photo-id="${photoId}"]`);
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

    // FIX: Hapus fetchImageStats — pakai pre-loaded stats dari /api/list (zero extra API call).
    // FIX: Preload gambar via Image() — modal tampil instan, gambar load di background.
    // FIX: recordView dipanggil awal untuk optimistic DOM update.
    async openImageModal(photo) {
        if (!photo) return;

        state.currentImageId = photo.id;

        // Optimistic DOM update + fire-and-forget ke server
        api.recordView(photo.id);

        // Pakai viewCount yang sudah di-increment oleh recordView DOM update
        const displayViews     = (photo.viewCount     || 0);
        const displayDownloads = (photo.downloadCount || 0);

        const imageUrl = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;

        // Shimmer placeholder saat gambar preload
        elements.modalImg.classList.add('loading-shimmer');
        elements.modalImg.style.minHeight = '200px';
        elements.modalImg.src             = '';
        elements.modalImg.onerror         = null;
        elements.modalImg.onload          = null;

        const preload   = new Image();
        preload.onload  = () => {
            elements.modalImg.src = imageUrl;
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
        preload.src = imageUrl;

        elements.modalTitle.textContent         = photo.title || 'Wallpaper';
        elements.modalCategory.textContent      = `${photo.category || photo.searchCategory || ''}${photo.subCategory ? ' / ' + photo.subCategory : ''}`;
        elements.modalViewCount.textContent     = utils.formatNumber(displayViews);
        elements.modalDownloadCount.textContent = utils.formatNumber(displayDownloads);

        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
        const isPurchased = state.lifetime || state.purchasedImages.has(photo.id);

        this.applyModalShield(isDtreasure && !isPurchased);

        if (isDtreasure) {
            if (isPurchased) {
                const token       = getOrCreateUserToken();
                const fullDlUrl   = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
                const filename    = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + '.jpg';
                const downloadUrl = `${fullDlUrl}?download=true&photoId=${encodeURIComponent(photo.id)}&userToken=${encodeURIComponent(token)}`;
                elements.downloadBtn.href = downloadUrl;
                elements.downloadBtn.setAttribute('download', filename);
                elements.downloadBtn.onclick = () => {
                    api.recordDownload(photo.id);
                    const el = elements.modalDownloadCount;
                    if (el) el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
                };
                elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
            } else {
                elements.downloadBtn.removeAttribute('href');
                elements.downloadBtn.removeAttribute('download');
                elements.downloadBtn.onclick = (e) => { e.preventDefault(); ui.handleDownload(photo); };
                elements.downloadBtn.innerHTML = '<i class="fas fa-lock mr-2"></i>10 Credits to Download';
            }
        } else {
            elements.downloadBtn.href      = imageUrl + '?download=true';
            elements.downloadBtn.download  = photo.title || 'wallpaper';
            elements.downloadBtn.onclick   = null;
            elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
        }

        // Tampilkan modal SEGERA — gambar selesai load di background
        elements.imageModal.classList.remove('hidden');
        elements.imageModal.classList.add('flex');

        const modalAdIns = document.querySelector('#ad-modal-sidebar ins:not([data-adsbygoogle-status])');
        if (modalAdIns) ads.push(modalAdIns);

        document.body.style.overflow = 'hidden';
    },
});
