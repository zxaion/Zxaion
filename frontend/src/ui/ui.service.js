/**
 * Main UI orchestration service. Dependencies are injected so rendering,
 * data access, state, and external payment hooks remain explicit.
 */
export function createUiService({
    API_BASE,
    ITEMS_PER_PAGE,
    ANIME_SUB_ALBUMS,
    CREDIT_PACKS,
    state,
    getOrCreateUserToken,
    utils,
    api,
    elements,
    ads,
    preventTouchSave,
    initPayPalPurchase
}) {
    const ui = {
        updateOriginalAlbumCount() {
            const originalAlbum = state.animeAlbums['ORIGINAL'];
            const count = originalAlbum ? originalAlbum.photos.length : 0;
            if (elements.originalCount) elements.originalCount.textContent = count.toLocaleString();
        },
    
        showEmptyState() {
            document.getElementById('empty-state')?.classList.remove('hidden');
        },
    
        hideEmptyState() {
            document.getElementById('empty-state')?.classList.add('hidden');
        },
    
        showNoResults() {
            document.getElementById('no-results')?.classList.remove('hidden');
        },
    
        hideNoResults() {
            document.getElementById('no-results')?.classList.add('hidden');
        },
    
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
    
        renderGallery() {
            if (!elements.galleryContainer) return;
    
            // FIX: selalu sembunyikan panel "Loading/Connecting" begitu proses
            // render galeri jalan, agar tidak tampil bersamaan dengan "No Results".
            this.hideEmptyState();
    
            if (state.filteredPhotos.length === 0) {
                elements.galleryContainer.innerHTML = '';
                this.showNoResults();
                if (elements.paginationContainer) elements.paginationContainer.classList.add('hidden');
                return;
            }
    
            this.hideNoResults();
    
            const start        = (state.currentPage - 1) * ITEMS_PER_PAGE;
            const end          = start + ITEMS_PER_PAGE;
            const photosToShow = state.filteredPhotos.slice(start, end);
    
            elements.galleryContainer.innerHTML = '';
    
            // Disconnect observer lama — cegah memory leak
            if (this._galleryObserver) this._galleryObserver.disconnect();
    
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '100px' });
    
            this._galleryObserver = imageObserver;
    
            const fragment       = document.createDocumentFragment();
            const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';
    
            photosToShow.forEach((photo, index) => {
                const item = document.createElement('div');
                item.className = 'masonry-item fade-in';
                item.style.animationDelay = `${index * 50}ms`;
                item.dataset.photoId = photo.id;
    
                const fullUrl       = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
                const viewCount     = utils.formatNumber(photo.viewCount     || 0);
                const downloadCount = utils.formatNumber(photo.downloadCount || 0);
    
                item.innerHTML = `
                <img
                    src="${placeholderSvg}"
                    data-src="${fullUrl}"
                    alt="${utils.escapeHtml(photo.title) || 'Wallpaper'}"
                    loading="lazy"
                    class="loading-shimmer w-full h-auto"
                    decoding="async">
                <div class="masonry-overlay">
                    <div class="stats">
                        <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${photo.id}">${viewCount}</span></span>
                        <span><i class="fas fa-download"></i> <span class="download-count" data-id="${photo.id}">${downloadCount}</span></span>
                    </div>
                    <button class="download-btn" type="button">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>`;
    
                const img   = item.querySelector('img');
                imageObserver.observe(img);
                img.onload  = function() { this.classList.remove('loading-shimmer'); };
                img.onerror = function() {
                    this.classList.remove('loading-shimmer');
                    this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';
                };
    
                fragment.appendChild(item);
            });
    
            elements.galleryContainer.appendChild(fragment);
            this.setupGalleryEventListeners();
            ads.injectInFeedAds(elements.galleryContainer);
    
            const afterGallery = document.getElementById('ad-after-gallery');
            if (afterGallery && state.filteredPhotos.length > 0) {
                afterGallery.classList.remove('hidden');
                const ins = afterGallery.querySelector('ins:not([data-adsbygoogle-status])');
                if (ins) ads.push(ins);
            }
    
            this.updatePagination();
        },
    
        setupGalleryEventListeners() {
            if (this.galleryClickHandler) {
                elements.galleryContainer.removeEventListener('click', this.galleryClickHandler);
            }
            const handleGalleryClick = (e) => {
                const downloadBtn = e.target.closest('.download-btn');
                if (downloadBtn) {
                    e.stopPropagation();
                    const item    = downloadBtn.closest('.masonry-item');
                    const photoId = item.dataset.photoId;
                    const photo   = state.filteredPhotos.find(p => p.id === photoId);
                    if (photo) ui.handleDownload(photo);
                    return;
                }
                const item = e.target.closest('.masonry-item');
                if (item && !e.target.closest('.download-btn')) {
                    const photoId = item.dataset.photoId;
                    const photo   = state.filteredPhotos.find(p => p.id === photoId);
                    if (photo) ui.openImageModal(photo);
                }
            };
            this.galleryClickHandler = handleGalleryClick;
            elements.galleryContainer.addEventListener('click', handleGalleryClick);
        },
    
        async handleDownload(photo) {
            if (!photo) return;
    
            const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
    
            if (isDtreasure) {
                if (state.lifetime || state.purchasedImages.has(photo.id)) {
                    this.triggerDownload(photo);
                    return;
                }
    
                if (state.credits < 10) {
                    alert('❌ Insufficient credits (Need: 10, Have: ' + state.credits + ')\n\nPlease buy more credits.');
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
                        const token       = getOrCreateUserToken();
                        const fullDlUrl   = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
                        const filename    = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + '.jpg';
                        const downloadUrl = `${fullDlUrl}?download=true&photoId=${encodeURIComponent(photo.id)}&userToken=${encodeURIComponent(token)}`;
                        elements.downloadBtn.href = downloadUrl;
                        elements.downloadBtn.setAttribute('download', filename);
                        elements.downloadBtn.onclick = () => { api.recordDownload(photo.id); };
                        elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
                    }
    
                    // O(1) DOM update pada item spesifik — tidak reset scroll position
                    this.unlockDtreasureThumbnail(photo.id);
                    this.triggerDownload(photo);
                } else {
                    alert('❌ ' + (result.error || 'Download failed. Please try again.'));
                }
            } else {
                this.triggerDownload(photo);
            }
        },
    
        async triggerDownload(photo) {
            if (!photo || !photo.url) return;
    
            // FIX: pencatatan stats dipisah jadi helper, dan untuk jalur DTREASURE
            // hanya dipanggil SETELAH fetch() sukses — sebelumnya stats naik duluan
            // walau download gagal/diblokir.
            const markDownloaded = () => {
                api.recordDownload(photo.id);
                document.querySelectorAll(`.download-count[data-id="${photo.id}"]`).forEach(el => {
                    el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
                });
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
    
                    markDownloaded(); // baru dicatat setelah blob berhasil didapat
    
                    loadingToast.innerHTML = '<i class="fas fa-check-circle text-green-400"></i> Download started!';
                    loadingToast.classList.add('bg-green-800');
    
                } catch (error) {
                    console.error('DTREASURE download error:', error);
                    loadingToast.innerHTML = `<i class="fas fa-times-circle text-red-400"></i> ${error.message}`;
                    loadingToast.classList.add('bg-red-800');
                    if (error.message.includes('403') || error.message.toLowerCase().includes('purchase required')) {
                        setTimeout(() => {
                            alert('❌ Download blocked: Purchase required.\n\nBuy credits to download DTREASURE images.');
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
    
        updatePagination() {
            if (!elements.paginationContainer) return;
            const totalPages = Math.ceil(state.filteredPhotos.length / ITEMS_PER_PAGE);
            if (totalPages > 1) {
                elements.paginationContainer.classList.remove('hidden');
                const pageInfo = document.getElementById('page-info');
                if (pageInfo) pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
                const prevBtn = document.getElementById('prev-page');
                const nextBtn = document.getElementById('next-page');
                if (prevBtn) prevBtn.disabled = state.currentPage === 1;
                if (nextBtn) nextBtn.disabled = state.currentPage === totalPages;
            } else {
                elements.paginationContainer.classList.add('hidden');
            }
        },
    
        renderAnimeCollections() {
            if (!elements.animeGrid) return;
            elements.animeGrid.innerHTML = '';
            const albumTitles = ANIME_SUB_ALBUMS.filter(title => title !== 'ORIGINAL');
            const fragment    = document.createDocumentFragment();
    
            albumTitles.forEach((title, index) => {
                const album = state.animeAlbums[title];
                const card  = document.createElement('div');
                card.className = 'anime-collection-card aspect-square relative cursor-pointer group fade-in';
                card.style.animationDelay = `${index * 30}ms`;
    
                const thumbnailSrc = window.animeAlbumThumbnails?.[title] || (album?.photos[0]?.url) || `${API_BASE}/api/img/HEADER/Anime.jpg`;
                const count        = album ? album.photos.length : 0;
    
                card.innerHTML = `
                    <div class="w-full h-full relative overflow-hidden rounded-2xl">
                        <img src="${thumbnailSrc}" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" loading="lazy" alt="${title}">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-4">
                            <h3 class="text-white font-black text-center uppercase text-sm md:text-base leading-tight drop-shadow-lg line-clamp-2">${title}</h3>
                            <p class="text-white/70 text-center text-xs mt-1 font-semibold">${count} items</p>
                        </div>
                    </div>
                `;
                card.addEventListener('click', () => this.openAnimeAlbum(title));
                fragment.appendChild(card);
            });
    
            elements.animeGrid.appendChild(fragment);
        },
    
        openAnimeAlbum(albumTitle) {
            state.currentAnimeAlbum = albumTitle;
            const album = state.animeAlbums[albumTitle];
    
            if (album) {
                state.filteredPhotos = state.allPhotos.filter(photo =>
                    photo.category && photo.category.toLowerCase() === 'anime' &&
                    photo.subCategory &&
                    photo.subCategory.toLowerCase() === album.folderName.toLowerCase()
                );
            } else {
                state.filteredPhotos = [];
            }
    
            if (elements.animeCollections)  elements.animeCollections.classList.add('hidden');
            if (elements.galleryContainer)  elements.galleryContainer.classList.remove('hidden');
    
            const heroTitle = document.getElementById('hero-title');
            const heroDesc  = document.getElementById('hero-desc');
            if (heroTitle) heroTitle.textContent = albumTitle;
            if (heroDesc)  heroDesc.textContent  = `${state.filteredPhotos.length} high quality wallpapers`;
    
            const actions = document.getElementById('hero-actions');
            if (actions) {
                actions.innerHTML = '';
                const backBtn = document.createElement('button');
                backBtn.className = 'border-2 border-white/50 text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-white/20 transition-all duration-300 backdrop-blur-sm';
                backBtn.innerHTML = '<i class="fas fa-arrow-left mr-2"></i> BACK TO ANIME';
                backBtn.onclick   = () => this.changeCategory('Anime');
                actions.appendChild(backBtn);
            }
    
            state.currentPage = 1;
            this.renderGallery();
            elements.galleryContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
    
        renderComitbaseGallery() {
            if (!elements.comitbaseGallery) return;
    
            if (state.comitbasePhotos.length === 0) {
                elements.comitbaseGallery.innerHTML = `
                <div class="col-span-full text-center py-20">
                    <div class="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center dark:bg-gray-700">
                        <i class="fas fa-images text-3xl text-gray-400"></i>
                    </div>
                    <p class="text-gray-500 dark:text-gray-400">No COMITBASE images yet</p>
                </div>`;
                if (elements.comitbasePagination) elements.comitbasePagination.classList.add('hidden');
                return;
            }
    
            const start        = (state.currentComitbasePage - 1) * ITEMS_PER_PAGE;
            const end          = start + ITEMS_PER_PAGE;
            const photosToShow = state.comitbasePhotos.slice(start, end);
    
            elements.comitbaseGallery.innerHTML = '';
    
            if (this._comitbaseObserver) this._comitbaseObserver.disconnect();
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '50px' });
            this._comitbaseObserver = imageObserver;
    
            // DocumentFragment — satu reflow saat append
            const fragment       = document.createDocumentFragment();
            const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';
    
            photosToShow.forEach((photo, index) => {
                const item = document.createElement('div');
                item.className = 'masonry-item fade-in';
                item.style.animationDelay = `${index * 50}ms`;
                item.dataset.photoId = photo.id;
    
                const fullUrl       = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
                const viewCount     = utils.formatNumber(photo.viewCount     || 0);
                const downloadCount = utils.formatNumber(photo.downloadCount || 0);
    
                item.innerHTML = `
                <img
                    src="${placeholderSvg}"
                    data-src="${fullUrl}"
                    alt="${utils.escapeHtml(photo.title)}"
                    loading="lazy"
                    class="loading-shimmer w-full h-auto"
                    decoding="async">
                <div class="masonry-overlay">
                    <div class="stats">
                        <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${photo.id}">${viewCount}</span></span>
                        <span><i class="fas fa-download"></i> <span class="download-count" data-id="${photo.id}">${downloadCount}</span></span>
                    </div>
                    <button class="download-btn" type="button">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>`;
    
                const img   = item.querySelector('img');
                imageObserver.observe(img);
                img.onload  = function() { this.classList.remove('loading-shimmer'); };
                img.onerror = function() {
                    this.classList.remove('loading-shimmer');
                    this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';
                };
                fragment.appendChild(item);
            });
    
            elements.comitbaseGallery.appendChild(fragment);
            this.setupComitbaseEventListeners();
            this.updateComitbasePagination();
        },
    
        setupComitbaseEventListeners() {
            if (this.comitbaseClickHandler) {
                elements.comitbaseGallery.removeEventListener('click', this.comitbaseClickHandler);
            }
            const handleClick = (e) => {
                const downloadBtn = e.target.closest('.download-btn');
                if (downloadBtn) {
                    e.stopPropagation();
                    const item    = downloadBtn.closest('.masonry-item');
                    const photoId = item.dataset.photoId;
                    const photo   = state.comitbasePhotos.find(p => p.id === photoId);
                    if (photo) ui.handleDownload(photo);
                    return;
                }
                const item = e.target.closest('.masonry-item');
                if (item && !e.target.closest('.download-btn')) {
                    const photoId = item.dataset.photoId;
                    const photo   = state.comitbasePhotos.find(p => p.id === photoId);
                    if (photo) ui.openImageModal(photo);
                }
            };
            this.comitbaseClickHandler = handleClick;
            elements.comitbaseGallery.addEventListener('click', handleClick);
        },
    
        updateComitbasePagination() {
            if (!elements.comitbasePagination) return;
            const totalPages = Math.ceil(state.comitbasePhotos.length / ITEMS_PER_PAGE);
            if (totalPages > 1) {
                elements.comitbasePagination.classList.remove('hidden');
                const pageInfo = document.getElementById('comitbase-page-info');
                if (pageInfo) pageInfo.textContent = `Page ${state.currentComitbasePage} of ${totalPages}`;
                const prevBtn = document.getElementById('comitbase-prev');
                const nextBtn = document.getElementById('comitbase-next');
                if (prevBtn) prevBtn.disabled = state.currentComitbasePage === 1;
                if (nextBtn) nextBtn.disabled = state.currentComitbasePage === totalPages;
            } else {
                elements.comitbasePagination.classList.add('hidden');
            }
        },
    
        renderDtreasureGallery() {
            if (!elements.dtreasureGallery) return;
    
            if (state.dtreasurePhotos.length === 0) {
                elements.dtreasureGallery.innerHTML = `
                <div class="col-span-full text-center py-20">
                    <div class="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center dark:bg-gray-700">
                        <i class="fas fa-gem text-3xl text-gray-400"></i>
                    </div>
                    <p class="text-gray-500 dark:text-gray-400">No DTREASURE images yet</p>
                </div>`;
                this.updateDtreasurePagination();
                return;
            }
    
            const start        = (state.currentDtreasurePage - 1) * ITEMS_PER_PAGE;
            const end          = start + ITEMS_PER_PAGE;
            const photosToShow = state.dtreasurePhotos.slice(start, end);
    
            elements.dtreasureGallery.innerHTML = '';
    
            if (this._dtreasureObserver) this._dtreasureObserver.disconnect();
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '50px' });
            this._dtreasureObserver = imageObserver;
    
            // DocumentFragment — satu reflow saat append
            const fragment       = document.createDocumentFragment();
            const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';
    
            photosToShow.forEach((photo, index) => {
                const item = document.createElement('div');
                item.className = 'masonry-item fade-in';
                item.style.animationDelay = `${index * 50}ms`;
                item.dataset.photoId = photo.id;
    
                const fullUrl       = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
                const isFree        = state.lifetime || state.purchasedImages.has(photo.id);
                const buttonText    = isFree ? 'Download' : '10 Credits';
                const buttonIcon    = isFree ? 'fa-download' : 'fa-lock';
                const viewCount     = utils.formatNumber(photo.viewCount     || 0);
                const downloadCount = utils.formatNumber(photo.downloadCount || 0);
    
                const thumbShield = isFree ? '' : `
        <div
            class="dtreasure-thumb-shield absolute inset-0 z-[1]"
            oncontextmenu="return false;"
            ondragstart="return false;"
            style="-webkit-tap-highlight-color:transparent; cursor:pointer;">
        </div>`;
    
                item.innerHTML = `
    <div class="relative" style="line-height:0;">
        <img
            src="${placeholderSvg}"
            data-src="${fullUrl}"
            alt="${utils.escapeHtml(photo.title)}"
            loading="lazy"
            class="loading-shimmer w-full h-auto select-none"
            decoding="async"
            draggable="false"
            style="-webkit-user-drag:none; ${isFree ? '' : '-webkit-touch-callout:none;'} user-select:none;">
        ${thumbShield}
    </div>
    <div class="masonry-overlay" style="z-index:2;">
        <div class="stats">
            <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${photo.id}">${viewCount}</span></span>
            <span><i class="fas fa-download"></i> <span class="download-count" data-id="${photo.id}">${downloadCount}</span></span>
        </div>
        <button class="download-btn" type="button">
            <i class="fas ${buttonIcon}"></i> ${buttonText}
        </button>
    </div>`;
    
                const img   = item.querySelector('img');
                imageObserver.observe(img);
                img.onload  = function() { this.classList.remove('loading-shimmer'); };
                img.onerror = function() {
                    this.classList.remove('loading-shimmer');
                    this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';
                };
                fragment.appendChild(item);
            });
    
            elements.dtreasureGallery.appendChild(fragment);
            this.setupDtreasureEventListeners();
            this.updateDtreasurePagination();
        },
    
        setupDtreasureEventListeners() {
            if (this.dtreasureClickHandler) {
                elements.dtreasureGallery.removeEventListener('click', this.dtreasureClickHandler);
            }
            const handleClick = (e) => {
                const downloadBtn = e.target.closest('.download-btn');
                if (downloadBtn) {
                    e.stopPropagation();
                    const item    = downloadBtn.closest('.masonry-item');
                    const photoId = item.dataset.photoId;
                    const photo   = state.dtreasurePhotos.find(p => p.id === photoId);
                    if (photo) ui.handleDownload(photo);
                    return;
                }
                const item = e.target.closest('.masonry-item');
                if (item && !e.target.closest('.download-btn')) {
                    const photoId = item.dataset.photoId;
                    const photo   = state.dtreasurePhotos.find(p => p.id === photoId);
                    if (photo) ui.openImageModal(photo);
                }
            };
            this.dtreasureClickHandler = handleClick;
            elements.dtreasureGallery.addEventListener('click', handleClick);
        },
    
        updateDtreasurePagination() {
            if (!elements.dtreasurePagination) return;
            const totalPages = Math.ceil(state.dtreasurePhotos.length / ITEMS_PER_PAGE);
            if (totalPages <= 1) {
                elements.dtreasurePagination.classList.add('hidden');
                return;
            }
            elements.dtreasurePagination.classList.remove('hidden');
            const pageInfo = document.getElementById('dtreasure-page-info');
            if (pageInfo) pageInfo.textContent = `Page ${state.currentDtreasurePage} of ${totalPages}`;
            const prevBtn = document.getElementById('dtreasure-prev');
            const nextBtn = document.getElementById('dtreasure-next');
            if (prevBtn) prevBtn.disabled = state.currentDtreasurePage === 1;
            if (nextBtn) nextBtn.disabled = state.currentDtreasurePage >= totalPages;
        },
    
        changeCategory(category) {
            if (!category) return;
    
            state.currentCategory   = category;
            state.currentAnimeAlbum = null;
            state.resetPagination();
            state.searchQuery = '';
    
            ads.handleCategoryChange(category);
    
            if (elements.searchInput)       elements.searchInput.value = '';
            if (elements.searchInputMobile) elements.searchInputMobile.value = '';
            if (elements.searchClear)       elements.searchClear.classList.add('hidden');
    
            document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
            const activeId  = category === 'All' ? 'cat-all' : `cat-${category.toLowerCase()}`;
            const activeBtn = document.getElementById(activeId);
            if (activeBtn) activeBtn.classList.add('active');
    
            if (elements.animeCollections)    elements.animeCollections.classList.add('hidden');
            if (elements.comitbaseSection)    elements.comitbaseSection.classList.add('hidden');
            if (elements.dtreasureSection)    elements.dtreasureSection.classList.add('hidden');
            if (elements.galleryContainer)    elements.galleryContainer.classList.add('hidden');
            if (elements.paginationContainer) elements.paginationContainer.classList.add('hidden');
    
            // Ranking carousel hanya di Home
            const rankingSection = document.getElementById('ranking-carousel-section');
            if (rankingSection) rankingSection.classList.toggle('hidden', category !== 'All');
    
            // Bersihkan timer auto-refresh saat ganti kategori
            if (_carouselRefreshTimer) {
                clearInterval(_carouselRefreshTimer);
                _carouselRefreshTimer = null;
            }
    
            if (category === 'All') {
                if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
                state.filteredPhotos = utils.shuffleArray(
                    state.allPhotos.filter(p => p.category && p.category.toLowerCase() === 'anime')
                );
                this.renderGallery();
    
                // Render carousel, lalu auto-refresh setiap 2 menit
                this.renderTopRankingCarousel().catch(e => console.error('renderTopRankingCarousel error:', e));
                _carouselRefreshTimer = setInterval(() => {
                    if (state.currentCategory === 'All') {
                        ui.renderTopRankingCarousel().catch(() => {});
                    } else {
                        clearInterval(_carouselRefreshTimer);
                        _carouselRefreshTimer = null;
                    }
                }, 120_000);
    
            } else if (category === 'Anime') {
                if (elements.animeCollections) elements.animeCollections.classList.remove('hidden');
                this.renderAnimeCollections();
    
            } else if (category === 'COMITBASE') {
                if (elements.comitbaseSection) elements.comitbaseSection.classList.remove('hidden');
                this.renderComitbaseGallery();
    
            } else if (category === 'DTREASURE') {
                if (elements.dtreasureSection) elements.dtreasureSection.classList.remove('hidden');
                this.renderDtreasureGallery();
    
            } else {
                if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
                state.filteredPhotos = state.allPhotos.filter(photo =>
                    photo.category && photo.category.toLowerCase() === category.toLowerCase()
                );
                this.renderGallery();
            }
    
            this.updateHeroSection(category);
            document.getElementById('page-hero')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
    
        updateHeroSection(category) {
            const pageDetails = {
                'All':         { title: 'ZXAION VERSE',          desc: 'Multi high quality wallpaper make your device more perfect' },
                'Anime':       { title: 'ANIME HIGH QUALITY',    desc: 'Pick your best waifu to your beloved device uwu' },
                'Abstract':    { title: 'Abstract & Texture',    desc: 'Exploration of shapes and colors.' },
                'Photography': { title: 'Photography Lens',      desc: 'Real moments in high resolution.' },
                'Fantasy':     { title: 'Fantasy & Myth',        desc: 'Dragons, magic, and medieval worlds.' },
                'COMITBASE':   { title: 'WORLDWIDE COLLECTION',  desc: 'Share your visual composition all around the world' },
                'DTREASURE':   { title: 'DTREASURE VAULT',       desc: 'Exclusive content, commercial use, best value' },
                'ZMEME':       { title: 'ZMEME',                 desc: 'Memes and fun images' },
                'OVERLAY':     { title: 'OVERLAY',               desc: 'Overlay graphics and templates' }
            };
    
            const detail    = pageDetails[category] || pageDetails['All'];
            const heroTitle = document.getElementById('hero-title');
            const heroDesc  = document.getElementById('hero-desc');
            if (heroTitle) heroTitle.textContent = detail.title;
            if (heroDesc)  heroDesc.textContent  = detail.desc;
    
            const hero = document.getElementById('page-hero');
            if (hero && window.headerBackgrounds?.[category]) {
                hero.style.backgroundImage = `url('${window.headerBackgrounds[category]}')`;
            }
    
            const actions = document.getElementById('hero-actions');
            if (actions) actions.innerHTML = '';
        },
    
        // FIX: Satu shared IntersectionObserver untuk semua kartu — O(1) vs O(N)
        async renderTopRankingCarousel() {
            const carousel = document.getElementById('ranking-carousel');
            if (!carousel) return;
    
            carousel.innerHTML = Array.from({ length: 6 }, () =>
                '<div class="flex-none rounded-2xl overflow-hidden bg-gray-800 ranking-card-skeleton" style="min-width:144px;width:144px;aspect-ratio:9/16;"></div>'
            ).join('');
    
            const photos = await api.fetchTrendingImages(20);
    
            if (!photos || photos.length === 0) {
                carousel.innerHTML =
                    '<div class="flex items-center justify-center w-full py-6">' +
                    '<p class="text-gray-500 text-sm">No trending data yet — start exploring!</p>' +
                    '</div>';
                return;
            }
    
            carousel.innerHTML = '';
            const fragment = document.createDocumentFragment();
    
            // Satu shared observer untuk semua kartu — cegah N observer instances
            const sharedObserver = 'IntersectionObserver' in window
                ? new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            if (img.dataset.src) {
                                img.src         = img.dataset.src;
                                delete img.dataset.src;
                                img.onerror = () => { img.style.opacity = '0.2'; };
                            }
                            observer.unobserve(img);
                        }
                    });
                }, { root: carousel, rootMargin: '200px' })
                : null;
    
            photos.forEach((photo, index) => {
                const fullUrl    = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
                const rankColors = ['from-amber-400 to-yellow-500', 'from-gray-300 to-gray-400', 'from-amber-700 to-amber-800'];
                const rankColor  = index < 3 ? rankColors[index] : 'from-gray-700 to-gray-800';
                const rankLabel  = index < 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][index] : `#${index + 1}`;
                const isMedal    = index < 3;
                const score      = (photo.viewCount || 0) + (photo.downloadCount || 0);
                const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='256'%3E%3Crect fill='%23222' width='144' height='256'/%3E%3C/svg%3E";
    
                const card = document.createElement('div');
                card.className = 'ranking-card flex-none cursor-pointer group relative rounded-2xl overflow-hidden shadow-lg ring-1 ring-white/10 bg-gray-900';
                card.style.cssText = 'min-width:144px;width:144px;';
    
                card.innerHTML =
                    '<div class="relative w-full" style="aspect-ratio:9/16;">' +
                        '<img src="' + placeholder + '" data-src="' + fullUrl + '" alt="' + utils.escapeHtml(photo.title) + '" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300 ranking-lazy-img" loading="lazy" decoding="async" draggable="false">' +
                        '<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent pointer-events-none"></div>' +
                        '<div class="absolute top-2 left-2 bg-gradient-to-br ' + rankColor + ' rounded-full w-8 h-8 flex items-center justify-center shadow-lg ' + (isMedal ? 'text-base' : 'text-white text-xs font-black') + '">' + rankLabel + '</div>' +
                        '<div class="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-1">' +
                            '<i class="fas fa-fire text-amber-400" style="font-size:8px;"></i>' +
                            '<span class="text-white text-[10px] font-bold">' + utils.formatNumber(score) + '</span>' +
                        '</div>' +
                        '<div class="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">' +
                            '<p class="text-white text-[11px] font-bold leading-tight" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + utils.escapeHtml(photo.title || 'Wallpaper') + '</p>' +
                            '<div class="flex items-center gap-2 mt-1.5">' +
                                '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-eye text-green-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.viewCount || 0) + '</span>' +
                                '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-download text-blue-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.downloadCount || 0) + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
    
                const img = card.querySelector('img.ranking-lazy-img');
                if (img) {
                    if (sharedObserver) sharedObserver.observe(img);
                    else if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                }
    
                card.addEventListener('click', () => ui.openImageModal(photo));
                fragment.appendChild(card);
            });
    
            carousel.appendChild(fragment);
        },
    
        handleSearch(query) {
            const searchTerm = (query || '').toLowerCase().trim();
            state.searchQuery = searchTerm;
    
            if (searchTerm.length > 0) {
                if (elements.searchClear) elements.searchClear.classList.remove('hidden');
    
                if (elements.animeCollections) elements.animeCollections.classList.add('hidden');
                if (elements.comitbaseSection) elements.comitbaseSection.classList.add('hidden');
                if (elements.dtreasureSection) elements.dtreasureSection.classList.add('hidden');
                if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
    
                const mainMatches = state.allPhotos.filter(photo =>
                    (photo.title        && photo.title.toLowerCase().includes(searchTerm)) ||
                    (photo.category     && photo.category.toLowerCase().includes(searchTerm)) ||
                    (photo.subCategory  && photo.subCategory.toLowerCase().includes(searchTerm)) ||
                    (photo.path         && photo.path.toLowerCase().includes(searchTerm))
                );
    
                const taggedComitbase = state.comitbasePhotos
                    .filter(p => (p.title && p.title.toLowerCase().includes(searchTerm)) || (p.uploader && p.uploader.toLowerCase().includes(searchTerm)))
                    .map(p => ({ ...p, searchCategory: 'COMITBASE' }));
    
                const taggedDtreasure = state.dtreasurePhotos
                    .filter(p => p.title && p.title.toLowerCase().includes(searchTerm))
                    .map(p => ({ ...p, searchCategory: 'DTREASURE' }));
    
                state.filteredPhotos = [...mainMatches, ...taggedComitbase, ...taggedDtreasure];
                state.currentPage    = 1;
                this.renderGallery();
    
                const heroTitle = document.getElementById('hero-title');
                const heroDesc  = document.getElementById('hero-desc');
                if (heroTitle) heroTitle.textContent = `Search: "${query}"`;
                if (heroDesc)  heroDesc.textContent  = `${state.filteredPhotos.length} results found`;
            } else {
                if (elements.searchClear) elements.searchClear.classList.add('hidden');
                state.currentAnimeAlbum = null;
                this.changeCategory(state.currentCategory);
            }
        },
    
        updateCreditDisplay() {
            if (elements.creditBalance) {
                elements.creditBalance.textContent = state.lifetime ? '∞' : utils.formatNumber(state.credits);
            }
        },
    
        async loadQuicklinks() {
            const list = document.getElementById('quicklinks-list');
            if (!list) return;
            try {
                const res = await fetch('/quicklink.json');
                if (!res.ok) throw new Error(`Failed to load quicklinks: HTTP ${res.status}`);
                const data = await res.json();
                list.innerHTML = '';
    
                Object.keys(data).forEach(key => {
                    const btn = document.createElement('button');
                    btn.type  = 'button';
                    btn.className = 'w-full text-left bg-gray-50 hover:bg-gray-100 p-4 rounded-xl transition-all duration-300 flex items-center justify-between group dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white';
                    btn.innerHTML = `
                        <span class="font-semibold">${utils.escapeHtml(data[key].title)}</span>
                        <i class="fas fa-chevron-right text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-300 dark:group-hover:text-gray-300"></i>
                    `;
                    btn.addEventListener('click', () => {
                        const titleEl    = document.getElementById('quicklink-title');
                        const contentEl  = document.getElementById('quicklink-content');
                        const modalEl    = document.getElementById('quicklink-content-modal');
                        const menuModalEl = document.getElementById('menu-modal');
    
                        if (titleEl)   titleEl.textContent = data[key].title;
                        if (contentEl) {
                            // Sanitasi dasar: hapus script, inline handlers, javascript: URI
                            const sanitized = (data[key].content || '')
                                .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
                                .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
                                .replace(/javascript\s*:/gi, '');
                            contentEl.innerHTML = sanitized;
                        }
                        if (modalEl)    { modalEl.classList.remove('hidden');    modalEl.classList.add('flex'); }
                        if (menuModalEl) { menuModalEl.classList.add('hidden'); menuModalEl.classList.remove('flex'); }
                    });
                    list.appendChild(btn);
                });
            } catch (e) {
                console.error('Failed to load quicklinks:', e);
                list.innerHTML = '<p class="text-center text-gray-500 py-4 dark:text-gray-400">Failed to load links</p>';
            }
        },
    
        initLogo() {
            if (!window.customLogo?.enabled || !window.customLogo?.url) return;
    
            const setupLogoImage = (imgEl, textEl, url, alt) => {
                if (!imgEl) return;
                imgEl.onerror = function() {
                    this.onerror = null;
                    this.classList.add('hidden');
                    if (textEl) textEl.classList.remove('hidden');
                    console.warn('Logo image failed to load, using text fallback');
                };
                imgEl.onload = function() {
                    this.onload = null;
                    if (textEl) textEl.classList.add('hidden');
                };
                imgEl.src = url;
                imgEl.alt = alt || 'Logo';
                imgEl.classList.remove('hidden');
            };
    
            setupLogoImage(document.getElementById('logo-image'),        document.getElementById('logo-text'),        window.customLogo.url, window.customLogo.alt);
            setupLogoImage(document.getElementById('footer-logo-image'), document.getElementById('footer-logo-text'), window.customLogo.url, window.customLogo.alt);
        },
    
        // Mengganti FontAwesome <i> tags dengan <img> dari R2.
        // Fallback otomatis ke FontAwesome jika gambar gagal load.
        initIcons() {
            if (!window.customIcons?.enabled || !Array.isArray(window.customIcons?.definitions)) return;
    
            window.customIcons.definitions.forEach(({ selector, url }) => {
                if (!selector || !url) return;
                try {
                    document.querySelectorAll(selector).forEach(iconEl => {
                        const img         = document.createElement('img');
                        img.src           = `${API_BASE}/api/img/${url}`;
                        img.alt           = '';
                        img.width         = 20;
                        img.height        = 20;
                        img.style.cssText = 'object-fit:contain;display:inline-block;vertical-align:middle;pointer-events:none;';
    
                        img.onerror = () => { img.remove(); iconEl.style.display = ''; };
                        img.onload  = () => { iconEl.style.display = 'none'; };
    
                        iconEl.parentNode.insertBefore(img, iconEl);
                    });
                } catch (e) {
                    console.warn('[initIcons] Selector error:', selector, e.message);
                }
            });
        },
    
        renderCreditPacks() {
            const packsDiv = document.getElementById('credit-packs');
            if (!packsDiv) return;
            packsDiv.innerHTML = '';
    
            Object.entries(CREDIT_PACKS).forEach(([key, pack]) => {
                const isLifetime = pack.credits === 'lifetime';
                const btn        = document.createElement('button');
                btn.type         = 'button';
                btn.className    = `credit-pack-card w-full bg-gradient-to-r ${pack.color} p-0.5 rounded-2xl transition-all duration-300`;
                btn.innerHTML = `
                    <div class="bg-white dark:bg-gray-800 rounded-[14px] p-4 flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-gradient-to-br ${pack.color} rounded-xl flex items-center justify-center shadow-lg">
                                <i class="fas fa-${isLifetime ? 'crown' : 'coins'} text-white text-xl"></i>
                            </div>
                            <div class="text-left">
                                <div class="font-bold text-gray-900 dark:text-white text-lg">${pack.label}</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">
                                    ${isLifetime ? 'Lifetime Access' : `${pack.credits.toLocaleString()} credits`}
                                    ${pack.bonus ? `<span class="text-green-500 font-semibold ml-1">+${pack.bonus} bonus</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="font-black text-2xl text-gray-900 dark:text-white">$${pack.price}</div>
                            <div class="text-xs text-gray-400">${isLifetime ? 'One-time' : 'USD'}</div>
                        </div>
                    </div>
                `;
    
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
                    btn.classList.add('selected');
                    state.selectedCreditPack = { key, ...pack };
                    initPayPalPurchase(key, pack.price);
                });
    
                packsDiv.appendChild(btn);
            });
        }
    };
    return ui;
}
