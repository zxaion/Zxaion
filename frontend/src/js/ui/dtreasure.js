/**
 * ui/dtreasure.js — Galeri DTREASURE (premium): All Vault & My Unlocked Library, sort & filter rasio, paginasi & infinite scroll.
 * Depends on: ui (base.js), state, elements, utils, galleryFilters, ITEMS_PER_PAGE
 */
Object.assign(ui, {
    _dtreasureSortKey: null,
    _sortedDtreasureCache: null,

    invalidateDtreasureSortCache() {
        this._dtreasureSortKey = null;
        this._sortedDtreasureCache = null;
    },

    updateDtreasureTabCounts() {
        const tabAll = elements.dtreasureTabAll || document.getElementById('dtreasure-tab-all');
        const tabLib = elements.dtreasureTabLibrary || document.getElementById('dtreasure-tab-library');
        const countEl = elements.dtreasureUnlockedCount || document.getElementById('dtreasure-unlocked-count');

        if (tabAll) tabAll.classList.toggle('active', state.dtreasureTab !== 'library');
        if (tabLib) tabLib.classList.toggle('active', state.dtreasureTab === 'library');
        if (countEl) {
            if (state.lifetime) {
                countEl.textContent = String(state.dtreasurePhotos.length || '∞');
            } else {
                const owned = state.dtreasurePhotos.filter(p => state.purchasedImages.has(p.id)).length;
                countEl.textContent = String(owned);
            }
        }
    },

    getDtreasureSortedPhotos() {
        const base = galleryFilters.filterDtreasureLibrary(state.dtreasurePhotos, {
            tab:          state.dtreasureTab,
            purchasedSet: state.purchasedImages,
            lifetime:     state.lifetime,
        });
        const key = `${state.dtreasureTab}:${state.sortBy}:${base.length}:${base[0]?.id || ''}:${state.lifetime ? 1 : 0}`;
        if (this._dtreasureSortKey === key && Array.isArray(this._sortedDtreasureCache)) {
            return this._sortedDtreasureCache;
        }
        const sorted = galleryFilters.sortPhotosList(base, state.sortBy, utils.shuffleArray);
        this._dtreasureSortKey = key;
        this._sortedDtreasureCache = sorted;
        return sorted;
    },

    getDtreasureDisplayPhotos() {
        const sorted = this.getDtreasureSortedPhotos();
        return galleryFilters.filterPhotosByRatio(sorted, state.aspectFilter, state.photoRatios);
    },

    renderDtreasureGallery({ append = false, previousCount = 0 } = {}) {
        if (!elements.dtreasureGallery) return;

        this.updateDtreasureTabCounts();

        const tabPhotos = galleryFilters.filterDtreasureLibrary(state.dtreasurePhotos, {
            tab:          state.dtreasureTab,
            purchasedSet: state.purchasedImages,
            lifetime:     state.lifetime,
        });

        if (state.dtreasurePhotos.length === 0) {
            if (state.dtreasureError) {
                elements.dtreasureGallery.innerHTML = `
                <div class="col-span-full text-center py-20" style="column-span:all;">
                    <div class="w-20 h-20 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                        <i class="fas fa-exclamation-triangle text-3xl text-red-500"></i>
                    </div>
                    <p class="text-gray-700 dark:text-gray-200 font-semibold mb-4">Failed to load DTREASURE vault</p>
                    <button type="button" data-action="retry-dtreasure" class="px-5 py-2.5 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 cursor-pointer dark:bg-white dark:text-black">
                        <i class="fas fa-sync-alt mr-1.5"></i>Try Again
                    </button>
                </div>`;
            } else {
                elements.dtreasureGallery.innerHTML = `
                <div class="col-span-full text-center py-20" style="column-span:all;">
                    <div class="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center dark:bg-gray-700">
                        <i class="fas fa-gem text-3xl text-gray-400"></i>
                    </div>
                    <p class="text-gray-500 dark:text-gray-400">No DTREASURE images yet</p>
                </div>`;
            }
            this.updateToolbarCount(0);
            this.updateDtreasurePagination(0);
            return;
        }

        if (state.dtreasureTab === 'library' && tabPhotos.length === 0) {
            elements.dtreasureGallery.innerHTML = `
            <div class="col-span-full text-center py-16 px-4 bg-white/80 dark:bg-gray-900/80 rounded-2xl border border-dashed border-amber-300 dark:border-amber-800/70" style="column-span:all;">
                <div class="w-16 h-16 mx-auto mb-4 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center">
                    <i class="fas fa-unlock-keyhole text-2xl text-amber-500"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-1">Your Unlocked Library is Empty</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-5">Unlock any DTREASURE artwork using credits (or get Lifetime Pro) to access clean 4K downloads anytime here.</p>
                <div class="flex flex-wrap items-center justify-center gap-3">
                    <button type="button" data-action="switch-dtreasure-tab" data-tab="all" class="px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow-md hover:from-amber-600 hover:to-orange-600 cursor-pointer">
                        <i class="fas fa-gem mr-1.5"></i>Browse All Vault
                    </button>
                    <button type="button" data-action="open-buy-credits" class="px-5 py-2.5 rounded-full bg-gray-900 text-white text-xs font-bold shadow-md hover:bg-gray-800 cursor-pointer dark:bg-white dark:text-black">
                        <i class="fas fa-shopping-cart mr-1.5"></i>Buy Credits
                    </button>
                </div>
            </div>`;
            this.updateToolbarCount(0);
            this.updateDtreasurePagination(0);
            return;
        }

        if (state.aspectFilter !== 'all') {
            this.probeMissingRatios(tabPhotos, () => {
                if (state.aspectFilter !== 'all' && state.currentCategory === 'DTREASURE') {
                    this.renderDtreasureGallery();
                }
            });
        }

        const displayPhotos = this.getDtreasureDisplayPhotos();
        this.updateToolbarCount(displayPhotos.length);

        if (displayPhotos.length === 0) {
            elements.dtreasureGallery.innerHTML = `
            <div class="col-span-full text-center py-16 bg-white/70 dark:bg-gray-900/70 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700" style="column-span:all;">
                <i class="fas fa-crop-simple text-3xl text-gray-400 mb-3"></i>
                <p class="text-gray-600 dark:text-gray-300 font-semibold mb-3">No ${utils.escapeHtml(state.aspectFilter)} wallpapers found in DTREASURE yet.</p>
                <button type="button" data-action="reset-aspect-filter" class="px-5 py-2 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 cursor-pointer dark:bg-white dark:text-black">
                    Show All Ratios
                </button>
            </div>`;
            this.updateDtreasurePagination(0);
            return;
        }

        const slice = galleryFilters.getPaginationSliceInfo(
            displayPhotos.length,
            state.currentDtreasurePage,
            ITEMS_PER_PAGE,
            state.browseMode
        );
        state.currentDtreasurePage = slice.page;

        const renderStart  = append ? Math.min(previousCount, slice.end) : slice.start;
        const photosToShow = displayPhotos.slice(renderStart, slice.end);

        if (!append) {
            elements.dtreasureGallery.innerHTML = '';
            if (this._dtreasureObserver) this._dtreasureObserver.disconnect();
        }

        if (!this._dtreasureObserver || !append) {
            this._dtreasureObserver = new IntersectionObserver((entries, observer) => {
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
            }, { rootMargin: '50px' });
        }

        const imageObserver  = this._dtreasureObserver;
        const fragment       = document.createDocumentFragment();
        const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';

        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'masonry-item fade-in';
            item.style.animationDelay = `${Math.min(index, 12) * 35}ms`;
            item.dataset.photoId = photo.id;

            const isFree        = state.lifetime || state.purchasedImages.has(photo.id);
            const transformOpts = isFree
                ? { w: 700, q: 82, fit: 'scale-down', fmt: 'auto' }
                : { w: 600, q: 75, fit: 'scale-down', fmt: 'auto' };
            const candidates    = utils.getImageFallbackCandidates(photo.url, transformOpts);
            const fullUrl       = candidates[0] || '';
            const safePhotoId   = utils.escapeHtml(photo.id);
            const buttonText    = isFree ? 'Download' : '10 Credits';
            const buttonIcon    = isFree ? 'fa-download' : 'fa-lock';
            const viewCount     = utils.formatNumber(photo.viewCount     || 0);
            const downloadCount = utils.formatNumber(photo.downloadCount || 0);
            const errorSvg      = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';

            const unlockedBadge = isFree
                ? `<span class="dtreasure-unlocked-badge absolute top-2.5 left-2.5 z-[2] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[10px] font-black uppercase tracking-wider shadow-md backdrop-blur-sm"><i class="fas fa-unlock"></i> Unlocked</span>`
                : '';

            const thumbShield = isFree ? '' : `
    <div
        class="dtreasure-thumb-shield absolute inset-0 z-[1]"
        style="-webkit-tap-highlight-color:transparent; cursor:pointer;">
    </div>`;

            item.innerHTML = `
<div class="relative" style="line-height:0;">
    ${unlockedBadge}
    <img
        src="${placeholderSvg}"
        ${isFree ? '' : `data-src="${utils.escapeHtml(fullUrl)}"`}
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
        <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${safePhotoId}">${viewCount}</span></span>
        <span><i class="fas fa-download"></i> <span class="download-count" data-id="${safePhotoId}">${downloadCount}</span></span>
    </div>
    <button class="download-btn" type="button">
        <i class="fas ${buttonIcon}"></i> ${buttonText}
    </button>
</div>`;

            const img   = item.querySelector('img');
            if (isFree && typeof utils.loadAuthenticatedImage === 'function') {
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
                        if (el.dataset.src) return;
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

        elements.dtreasureGallery.appendChild(fragment);
        this.setupDtreasureEventListeners();
        this.updateDtreasurePagination(displayPhotos.length);
    },

    loadMoreDtreasure() {
        const displayPhotos = this.getDtreasureDisplayPhotos();
        const prevSlice = galleryFilters.getPaginationSliceInfo(
            displayPhotos.length,
            state.currentDtreasurePage,
            ITEMS_PER_PAGE,
            'infinite'
        );
        if (!prevSlice.hasMore) return;
        state.currentDtreasurePage++;
        this.renderDtreasureGallery({ append: true, previousCount: prevSlice.end });
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

    updateDtreasurePagination(totalOverride = null) {
        const container = elements.dtreasurePagination || document.getElementById('dtreasure-pagination');
        const loadMoreBox = elements.dtreasureLoadMore || document.getElementById('dtreasure-load-more');
        const totalItems = totalOverride !== null ? totalOverride : this.getDtreasureDisplayPhotos().length;
        const slice = galleryFilters.getPaginationSliceInfo(totalItems, state.currentDtreasurePage, ITEMS_PER_PAGE, state.browseMode);

        if (totalItems === 0 || slice.totalPages <= 1) {
            if (container) container.classList.add('hidden');
            if (loadMoreBox) loadMoreBox.classList.add('hidden');
            this.setupInfiniteSentinel('dtreasure-infinite-sentinel', '_dtreasureInfiniteObserver', false, () => {});
            return;
        }

        if (state.browseMode === 'infinite') {
            if (container) container.classList.add('hidden');
            if (loadMoreBox) {
                loadMoreBox.classList.remove('hidden');
                const loadedInfo = document.getElementById('dtreasure-loaded-info');
                const loadMoreBtn = document.getElementById('dtreasure-load-more-btn');
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
            this.setupInfiniteSentinel('dtreasure-infinite-sentinel', '_dtreasureInfiniteObserver', slice.hasMore, () => {
                this.loadMoreDtreasure();
            });
            return;
        }

        this.setupInfiniteSentinel('dtreasure-infinite-sentinel', '_dtreasureInfiniteObserver', false, () => {});
        if (loadMoreBox) loadMoreBox.classList.add('hidden');
        if (!container) return;

        container.classList.remove('hidden');
        const pageInfo = document.getElementById('dtreasure-page-info');
        if (pageInfo) pageInfo.textContent = `Page ${slice.page} of ${slice.totalPages}`;
        const prevBtn = document.getElementById('dtreasure-prev');
        const nextBtn = document.getElementById('dtreasure-next');
        if (prevBtn) prevBtn.disabled = slice.page <= 1;
        if (nextBtn) nextBtn.disabled = slice.page >= slice.totalPages;
    },
});
