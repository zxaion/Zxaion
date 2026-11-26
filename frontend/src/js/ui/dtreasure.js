/**
 * ui/dtreasure.js — Galeri DTREASURE (premium): All Vault & My Unlocked Library, sort & filter rasio, paginasi & infinite scroll.
 * Depends on: ui (base.js), state, elements, utils, galleryFilters, ITEMS_PER_PAGE
 */
Object.assign(ui, {
    invalidateDtreasureSortCache() {
        this.invalidateSortCache('dtreasure');
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
        return this.getCachedSortedPhotos('dtreasure', base, key);
    },

    getDtreasureDisplayPhotos() {
        return galleryFilters.filterPhotosByRatio(this.getDtreasureSortedPhotos(), state.aspectFilter, state.photoRatios);
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
            this.renderBucketErrorOrEmpty(elements.dtreasureGallery, {
                isError: state.dtreasureError,
                retryAction: 'retry-dtreasure',
                errorLabel: 'Failed to load DTREASURE vault',
                emptyIcon: 'fa-gem',
                emptyLabel: 'No DTREASURE images yet',
            });
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
            this.renderRatioEmptyBanner(elements.dtreasureGallery, 'DTREASURE');
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

        if (!append) elements.dtreasureGallery.innerHTML = '';

        const imageObserver = this.getGallerySliceObserver('_dtreasureObserver', { append, rootMargin: '50px' });
        const fragment = document.createDocumentFragment();
        photosToShow.forEach((photo, index) => {
            fragment.appendChild(this.createMasonryItemElement(photo, index, imageObserver, {
                isDtreasureCard: true,
                authImageLoader: utils.loadAuthenticatedImage,
            }));
        });

        elements.dtreasureGallery.appendChild(fragment);
        this.setupDtreasureEventListeners();
        this.updateDtreasurePagination(displayPhotos.length);
    },

    loadMoreDtreasure() {
        this.loadMoreSection(this.getDtreasureDisplayPhotos(), 'currentDtreasurePage', (opts) => this.renderDtreasureGallery(opts));
    },

    setupDtreasureEventListeners() {
        this.bindMasonryDelegation(elements.dtreasureGallery, 'dtreasureClickHandler', () => state.dtreasurePhotos);
    },

    updateDtreasurePagination(totalOverride = null) {
        const totalItems = totalOverride !== null ? totalOverride : this.getDtreasureDisplayPhotos().length;
        this.updateSectionPagination({
            containerEl: elements.dtreasurePagination || document.getElementById('dtreasure-pagination'),
            loadMoreEl:  elements.dtreasureLoadMore || document.getElementById('dtreasure-load-more'),
            totalItems,
            currentPage: state.currentDtreasurePage,
            observerKey: '_dtreasureInfiniteObserver',
            ids: {
                sentinel:    'dtreasure-infinite-sentinel',
                loadedInfo:  'dtreasure-loaded-info',
                loadMoreBtn: 'dtreasure-load-more-btn',
                pageInfo:    'dtreasure-page-info',
                prevBtn:     'dtreasure-prev',
                nextBtn:     'dtreasure-next',
            },
            onLoadMore: () => this.loadMoreDtreasure(),
        });
    },
});
