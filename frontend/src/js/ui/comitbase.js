/**
 * ui/comitbase.js — Galeri COMITBASE: render, sort & filter rasio, event klik, paginasi & infinite scroll.
 * Depends on: ui (base.js), state, elements, utils, galleryFilters, ITEMS_PER_PAGE
 */
Object.assign(ui, {
    _comitbaseSortKey: null,
    _sortedComitbaseCache: null,

    invalidateComitbaseSortCache() {
        this._comitbaseSortKey = null;
        this._sortedComitbaseCache = null;
    },

    getComitbaseSortedPhotos() {
        const base = Array.isArray(state.comitbasePhotos) ? state.comitbasePhotos : [];
        const key = `${state.sortBy}:${base.length}:${base[0]?.id || ''}`;
        if (this._comitbaseSortKey === key && Array.isArray(this._sortedComitbaseCache)) {
            return this._sortedComitbaseCache;
        }
        const sorted = galleryFilters.sortPhotosList(base, state.sortBy, utils.shuffleArray);
        this._comitbaseSortKey = key;
        this._sortedComitbaseCache = sorted;
        return sorted;
    },

    getComitbaseDisplayPhotos() {
        const sorted = this.getComitbaseSortedPhotos();
        return galleryFilters.filterPhotosByRatio(sorted, state.aspectFilter, state.photoRatios);
    },

    renderComitbaseGallery({ append = false, previousCount = 0 } = {}) {
        if (!elements.comitbaseGallery) return;

        if (state.comitbasePhotos.length === 0) {
            elements.comitbaseGallery.innerHTML = `
            <div class="col-span-full text-center py-20" style="column-span:all;">
                <div class="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center dark:bg-gray-700">
                    <i class="fas fa-images text-3xl text-gray-400"></i>
                </div>
                <p class="text-gray-500 dark:text-gray-400">No COMITBASE images yet</p>
            </div>`;
            this.updateToolbarCount(0);
            this.updateComitbasePagination(0);
            return;
        }

        if (state.aspectFilter !== 'all') {
            this.probeMissingRatios(state.comitbasePhotos, () => {
                if (state.aspectFilter !== 'all' && state.currentCategory === 'COMITBASE') {
                    this.renderComitbaseGallery();
                }
            });
        }

        const displayPhotos = this.getComitbaseDisplayPhotos();
        this.updateToolbarCount(displayPhotos.length);

        if (displayPhotos.length === 0) {
            elements.comitbaseGallery.innerHTML = `
            <div class="col-span-full text-center py-16 bg-white/70 dark:bg-gray-900/70 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700" style="column-span:all;">
                <i class="fas fa-crop-simple text-3xl text-gray-400 mb-3"></i>
                <p class="text-gray-600 dark:text-gray-300 font-semibold mb-3">No ${utils.escapeHtml(state.aspectFilter)} wallpapers found in COMITBASE yet.</p>
                <button type="button" onclick="resetAspectFilter()" class="px-5 py-2 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 cursor-pointer dark:bg-white dark:text-black">
                    Show All Ratios
                </button>
            </div>`;
            this.updateComitbasePagination(0);
            return;
        }

        const slice = galleryFilters.getPaginationSliceInfo(
            displayPhotos.length,
            state.currentComitbasePage,
            ITEMS_PER_PAGE,
            state.browseMode
        );
        state.currentComitbasePage = slice.page;

        const renderStart  = append ? Math.min(previousCount, slice.end) : slice.start;
        const photosToShow = displayPhotos.slice(renderStart, slice.end);

        if (!append) {
            elements.comitbaseGallery.innerHTML = '';
            if (this._comitbaseObserver) this._comitbaseObserver.disconnect();
        }

        if (!this._comitbaseObserver || !append) {
            this._comitbaseObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '50px' });
        }

        const imageObserver  = this._comitbaseObserver;
        const fragment       = document.createDocumentFragment();
        const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';

        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'masonry-item fade-in';
            item.style.animationDelay = `${Math.min(index, 12) * 35}ms`;
            item.dataset.photoId = photo.id;

            const fullUrl       = utils.buildImageUrl(photo.url, { w: 600, q: 80, fit: 'scale-down', fmt: 'auto' });
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
            img.onload  = function() {
                this.classList.remove('loading-shimmer');
                ui.recordPhotoDimensions(photo, this);
            };
            img.onerror = function() {
                this.classList.remove('loading-shimmer');
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';
            };
            fragment.appendChild(item);
        });

        elements.comitbaseGallery.appendChild(fragment);
        this.setupComitbaseEventListeners();
        this.updateComitbasePagination(displayPhotos.length);
    },

    loadMoreComitbase() {
        const displayPhotos = this.getComitbaseDisplayPhotos();
        const prevSlice = galleryFilters.getPaginationSliceInfo(
            displayPhotos.length,
            state.currentComitbasePage,
            ITEMS_PER_PAGE,
            'infinite'
        );
        if (!prevSlice.hasMore) return;
        state.currentComitbasePage++;
        this.renderComitbaseGallery({ append: true, previousCount: prevSlice.end });
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

    updateComitbasePagination(totalOverride = null) {
        const container = elements.comitbasePagination || document.getElementById('comitbase-pagination');
        const loadMoreBox = elements.comitbaseLoadMore || document.getElementById('comitbase-load-more');
        const totalItems = totalOverride !== null ? totalOverride : this.getComitbaseDisplayPhotos().length;
        const slice = galleryFilters.getPaginationSliceInfo(totalItems, state.currentComitbasePage, ITEMS_PER_PAGE, state.browseMode);

        if (totalItems === 0 || slice.totalPages <= 1) {
            if (container) container.classList.add('hidden');
            if (loadMoreBox) loadMoreBox.classList.add('hidden');
            this.setupInfiniteSentinel('comitbase-infinite-sentinel', '_comitbaseInfiniteObserver', false, () => {});
            return;
        }

        if (state.browseMode === 'infinite') {
            if (container) container.classList.add('hidden');
            if (loadMoreBox) {
                loadMoreBox.classList.remove('hidden');
                const loadedInfo = document.getElementById('comitbase-loaded-info');
                const loadMoreBtn = document.getElementById('comitbase-load-more-btn');
                if (loadedInfo) {
                    loadedInfo.textContent = slice.hasMore
                        ? `Showing ${slice.end} of ${slice.total}`
                        : `All ${slice.total} items loaded`;
                }
                if (loadMoreBtn) {
                    loadMoreBtn.disabled = !slice.hasMore;
                    loadMoreBtn.classList.toggle('hidden', !slice.hasMore);
                }
            }
            this.setupInfiniteSentinel('comitbase-infinite-sentinel', '_comitbaseInfiniteObserver', slice.hasMore, () => {
                this.loadMoreComitbase();
            });
            return;
        }

        this.setupInfiniteSentinel('comitbase-infinite-sentinel', '_comitbaseInfiniteObserver', false, () => {});
        if (loadMoreBox) loadMoreBox.classList.add('hidden');
        if (!container) return;

        container.classList.remove('hidden');
        const pageInfo = document.getElementById('comitbase-page-info');
        if (pageInfo) pageInfo.textContent = `Page ${slice.page} of ${slice.totalPages}`;
        const prevBtn = document.getElementById('comitbase-prev');
        const nextBtn = document.getElementById('comitbase-next');
        if (prevBtn) prevBtn.disabled = slice.page <= 1;
        if (nextBtn) nextBtn.disabled = slice.page >= slice.totalPages;
    },
});
