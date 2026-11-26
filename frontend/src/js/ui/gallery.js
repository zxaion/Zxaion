/**
 * ui/gallery.js — Galeri utama (masonry), sort & filter rasio, event klik galeri, paginasi & infinite scroll.
 * Depends on: ui (base.js), state, elements, utils, galleryFilters, ITEMS_PER_PAGE
 */
Object.assign(ui, {
    invalidateMainSortCache() {
        this.invalidateSortCache('main');
    },

    getMainSortedPhotos() {
        const base = Array.isArray(state.filteredPhotos) ? state.filteredPhotos : [];
        const key = `${state.sortBy}:${base.length}:${base[0]?.id || ''}:${base[base.length - 1]?.id || ''}`;
        return this.getCachedSortedPhotos('main', base, key);
    },

    getMainDisplayPhotos() {
        return galleryFilters.filterPhotosByRatio(this.getMainSortedPhotos(), state.aspectFilter, state.photoRatios);
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
            this.renderRatioEmptyBanner(elements.galleryContainer, 'this view');
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

        if (!append) elements.galleryContainer.innerHTML = '';

        const imageObserver = this.getGallerySliceObserver('_galleryObserver', { append, rootMargin: '100px' });
        const fragment = document.createDocumentFragment();
        photosToShow.forEach((photo, index) => {
            const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
            fragment.appendChild(this.createMasonryItemElement(photo, index, imageObserver, {
                isDtreasureCard: isDtreasure,
                fallbackTitle: 'Wallpaper',
            }));
        });

        elements.galleryContainer.appendChild(fragment);
        this.setupGalleryEventListeners();
        this.updatePagination(displayPhotos.length);
    },

    loadMoreGallery() {
        this.loadMoreSection(this.getMainDisplayPhotos(), 'currentPage', (opts) => this.renderGallery(opts));
    },

    setupGalleryEventListeners() {
        this.bindMasonryDelegation(elements.galleryContainer, 'galleryClickHandler', () => state.filteredPhotos);
    },

    updatePagination(totalOverride = null) {
        const totalItems = totalOverride !== null ? totalOverride : this.getMainDisplayPhotos().length;
        this.updateSectionPagination({
            containerEl: elements.paginationContainer || document.getElementById('pagination-container'),
            loadMoreEl:  elements.infiniteLoadMore || document.getElementById('infinite-load-more'),
            totalItems,
            currentPage: state.currentPage,
            observerKey: '_galleryInfiniteObserver',
            ids: {
                sentinel:    'gallery-infinite-sentinel',
                loadedInfo:  'gallery-loaded-info',
                loadMoreBtn: 'gallery-load-more-btn',
                pageInfo:    'page-info',
                prevBtn:     'prev-page',
                nextBtn:     'next-page',
            },
            onLoadMore: () => this.loadMoreGallery(),
        });
    },
});
