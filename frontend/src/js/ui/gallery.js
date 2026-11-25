/**
 * ui/gallery.js — Galeri utama (masonry), sort & filter rasio, event klik galeri, paginasi & infinite scroll.
 * Depends on: ui (base.js), state, elements, utils, galleryFilters, ITEMS_PER_PAGE
 */
Object.assign(ui, {
    _mainSortKey: null,
    _sortedMainCache: null,

    invalidateMainSortCache() {
        this._mainSortKey = null;
        this._sortedMainCache = null;
    },

    getMainSortedPhotos() {
        const base = Array.isArray(state.filteredPhotos) ? state.filteredPhotos : [];
        const key = `${state.sortBy}:${base.length}:${base[0]?.id || ''}:${base[base.length - 1]?.id || ''}`;
        if (this._mainSortKey === key && Array.isArray(this._sortedMainCache)) {
            return this._sortedMainCache;
        }
        const sorted = galleryFilters.sortPhotosList(base, state.sortBy, utils.shuffleArray);
        this._mainSortKey = key;
        this._sortedMainCache = sorted;
        return sorted;
    },

    getMainDisplayPhotos() {
        const sorted = this.getMainSortedPhotos();
        return galleryFilters.filterPhotosByRatio(sorted, state.aspectFilter, state.photoRatios);
    },

    renderGallery({ append = false, previousCount = 0 } = {}) {
        if (!elements.galleryContainer) return;

        this.hideEmptyState();

        if (state.filteredPhotos.length === 0) {
            elements.galleryContainer.innerHTML = '';
            this.showNoResults();
            this.updateToolbarCount(0);
            this.updatePagination(0);
            return;
        }

        this.hideNoResults();

        if (state.aspectFilter !== 'all') {
            this.probeMissingRatios(state.filteredPhotos, () => {
                if (state.aspectFilter !== 'all' && state.currentCategory !== 'COMITBASE' && state.currentCategory !== 'DTREASURE') {
                    this.renderGallery();
                }
            });
        }

        const displayPhotos = this.getMainDisplayPhotos();
        this.updateToolbarCount(displayPhotos.length);

        if (displayPhotos.length === 0) {
            elements.galleryContainer.innerHTML = `
            <div class="col-span-full text-center py-16 bg-white/70 dark:bg-gray-900/70 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700" style="column-span:all;">
                <i class="fas fa-crop-simple text-3xl text-gray-400 mb-3"></i>
                <p class="text-gray-600 dark:text-gray-300 font-semibold mb-3">No ${utils.escapeHtml(state.aspectFilter)} wallpapers found in this view yet.</p>
                <button type="button" data-action="reset-aspect-filter" class="px-5 py-2 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 cursor-pointer dark:bg-white dark:text-black">
                    Show All Ratios
                </button>
            </div>`;
            this.updatePagination(0);
            return;
        }

        const slice = galleryFilters.getPaginationSliceInfo(
            displayPhotos.length,
            state.currentPage,
            ITEMS_PER_PAGE,
            state.browseMode
        );
        state.currentPage = slice.page;

        const renderStart  = append ? Math.min(previousCount, slice.end) : slice.start;
        const photosToShow = displayPhotos.slice(renderStart, slice.end);

        if (!append) {
            elements.galleryContainer.innerHTML = '';
            if (this._galleryObserver) this._galleryObserver.disconnect();
        }

        if (!this._galleryObserver || !append) {
            this._galleryObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (typeof img._lazyLoadFn === 'function') {
                            const loadFn = img._lazyLoadFn;
                            img._lazyLoadFn = null;
                            loadFn();
                        } else if (img.dataset.src) {
                            img.src = img.dataset.src;
                            delete img.dataset.src;
                        }
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '100px' });
        }

        const imageObserver  = this._galleryObserver;
        const fragment       = document.createDocumentFragment();
        const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';

        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'masonry-item fade-in';
            item.style.animationDelay = `${Math.min(index, 12) * 35}ms`;
            item.dataset.photoId = photo.id;

            const isDtreasure   = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
            const isFree        = !isDtreasure || state.lifetime || state.purchasedImages.has(photo.id);
            const useAuthLoad   = isDtreasure && isFree && typeof utils.loadAuthenticatedImage === 'function';
            const transformOpts = (isDtreasure && isFree)
                ? { w: 700, q: 82, fit: 'scale-down', fmt: 'auto' }
                : (isDtreasure ? { w: 600, q: 75, fit: 'scale-down', fmt: 'auto' } : { w: 600, q: 80, fit: 'scale-down', fmt: 'auto' });
            const candidates    = utils.getImageFallbackCandidates(photo.url, transformOpts);
            const fullUrl       = candidates[0] || '';
            const safePhotoId   = utils.escapeHtml(photo.id);
            const viewCount     = utils.formatNumber(photo.viewCount     || 0);
            const downloadCount = utils.formatNumber(photo.downloadCount || 0);
            const buttonText    = isFree ? 'Download' : '10 Credits';
            const buttonIcon    = isFree ? 'fa-download' : 'fa-lock';
            const errorSvg      = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';

            const unlockedBadge = isDtreasure && isFree
                ? `<span class="dtreasure-unlocked-badge absolute top-2.5 left-2.5 z-[2] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[10px] font-black uppercase tracking-wider shadow-md backdrop-blur-sm"><i class="fas fa-unlock"></i> Unlocked</span>`
                : '';

            const thumbShield = isDtreasure && !isFree
                ? `<div class="dtreasure-thumb-shield absolute inset-0 z-[1]" style="-webkit-tap-highlight-color:transparent; cursor:pointer;"></div>`
                : '';

            const imgHtml = isDtreasure
                ? `<div class="relative" style="line-height:0;">
                    ${unlockedBadge}
                    <img
                        src="${placeholderSvg}"
                        ${useAuthLoad ? '' : `data-src="${utils.escapeHtml(fullUrl)}"`}
                        alt="${utils.escapeHtml(photo.title) || 'Wallpaper'}"
                        loading="lazy"
                        class="loading-shimmer w-full h-auto select-none"
                        decoding="async"
                        draggable="false"
                        style="-webkit-user-drag:none; ${isFree ? '' : '-webkit-touch-callout:none;'} user-select:none;">
                    ${thumbShield}
                   </div>`
                : `<img
                    src="${placeholderSvg}"
                    data-src="${utils.escapeHtml(fullUrl)}"
                    alt="${utils.escapeHtml(photo.title) || 'Wallpaper'}"
                    loading="lazy"
                    class="loading-shimmer w-full h-auto"
                    decoding="async">`;

            item.innerHTML = `
            ${imgHtml}
            <div class="masonry-overlay" style="z-index:2;">
                <div class="stats">
                    <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${safePhotoId}">${viewCount}</span></span>
                    <span><i class="fas fa-download"></i> <span class="download-count" data-id="${safePhotoId}">${downloadCount}</span></span>
                </div>
                <button class="download-btn" type="button">
                    <i class="fas ${buttonIcon}"></i> ${buttonText}
                </button>
            </div>`;

            const img   = item.querySelector('img');
            if (useAuthLoad) {
                img._lazyLoadFn = () => {
                    utils.loadAuthenticatedImage(img, photo.url, transformOpts, {
                        fallbackSvg: errorSvg,
                        onLoadSuccess(el) {
                            el.classList.remove('loading-shimmer');
                            ui.recordPhotoDimensions(photo, el);
                        },
                        onFinalError(el) {
                            el.classList.remove('loading-shimmer');
                            el.src = errorSvg;
                        },
                    });
                };
            } else {
                utils.attachImageFallback(img, candidates, {
                    fallbackSvg: errorSvg,
                    onLoadSuccess(el) {
                        if (el.dataset.src) return; // Abaikan onload dari placeholderSvg sebelum lazy-load
                        el.classList.remove('loading-shimmer');
                        ui.recordPhotoDimensions(photo, el);
                    },
                    onFinalError(el) {
                        el.classList.remove('loading-shimmer');
                        el.src = errorSvg;
                    },
                });
            }
            imageObserver.observe(img);

            fragment.appendChild(item);
        });

        elements.galleryContainer.appendChild(fragment);
        this.setupGalleryEventListeners();
        this.updatePagination(displayPhotos.length);
    },

    loadMoreGallery() {
        const displayPhotos = this.getMainDisplayPhotos();
        const prevSlice = galleryFilters.getPaginationSliceInfo(
            displayPhotos.length,
            state.currentPage,
            ITEMS_PER_PAGE,
            'infinite'
        );
        if (!prevSlice.hasMore) return;
        state.currentPage++;
        this.renderGallery({ append: true, previousCount: prevSlice.end });
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

    updatePagination(totalOverride = null) {
        const container = elements.paginationContainer || document.getElementById('pagination-container');
        const loadMoreBox = elements.infiniteLoadMore || document.getElementById('infinite-load-more');
        const totalItems = totalOverride !== null ? totalOverride : this.getMainDisplayPhotos().length;
        const slice = galleryFilters.getPaginationSliceInfo(totalItems, state.currentPage, ITEMS_PER_PAGE, state.browseMode);

        if (totalItems === 0 || slice.totalPages <= 1) {
            if (container) container.classList.add('hidden');
            if (loadMoreBox) loadMoreBox.classList.add('hidden');
            this.setupInfiniteSentinel('gallery-infinite-sentinel', '_galleryInfiniteObserver', false, () => {});
            return;
        }

        if (state.browseMode === 'infinite') {
            if (container) container.classList.add('hidden');
            if (loadMoreBox) {
                loadMoreBox.classList.remove('hidden');
                const loadedInfo = document.getElementById('gallery-loaded-info');
                const loadMoreBtn = document.getElementById('gallery-load-more-btn');
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
            this.setupInfiniteSentinel('gallery-infinite-sentinel', '_galleryInfiniteObserver', slice.hasMore, () => {
                this.loadMoreGallery();
            });
            return;
        }

        this.setupInfiniteSentinel('gallery-infinite-sentinel', '_galleryInfiniteObserver', false, () => {});
        if (loadMoreBox) loadMoreBox.classList.add('hidden');
        if (!container) return;

        container.classList.remove('hidden');
        const pageInfo = document.getElementById('page-info');
        if (pageInfo) pageInfo.textContent = `Page ${slice.page} of ${slice.totalPages}`;
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.disabled = slice.page <= 1;
        if (nextBtn) nextBtn.disabled = slice.page >= slice.totalPages;
    },
});
