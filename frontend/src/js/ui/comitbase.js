/**
 * ui/comitbase.js — Galeri COMITBASE: render, sort & filter rasio, event klik, paginasi & infinite scroll.
 * Depends on: ui (base.js), state, elements, utils, galleryFilters, ITEMS_PER_PAGE
 */
Object.assign(ui, {
    invalidateComitbaseSortCache() {
        this.invalidateSortCache('comitbase');
    },

    getComitbaseSortedPhotos() {
        const base = Array.isArray(state.comitbasePhotos) ? state.comitbasePhotos : [];
        const key = `${state.sortBy}:${base.length}:${base[0]?.id || ''}`;
        return this.getCachedSortedPhotos('comitbase', base, key);
    },

    getComitbaseDisplayPhotos() {
        return galleryFilters.filterPhotosByRatio(this.getComitbaseSortedPhotos(), state.aspectFilter, state.photoRatios);
    },

    renderComitbaseGallery({ append = false, previousCount = 0 } = {}) {
        if (!elements.comitbaseGallery) return;

        if (state.comitbasePhotos.length === 0) {
            this.renderBucketErrorOrEmpty(elements.comitbaseGallery, {
                isError: state.comitbaseError,
                retryAction: 'retry-comitbase',
                errorLabel: 'Failed to load COMITBASE collection',
                emptyIcon: 'fa-images',
                emptyLabel: 'No COMITBASE images yet',
            });
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
            this.renderRatioEmptyBanner(elements.comitbaseGallery, 'COMITBASE');
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

        if (!append) elements.comitbaseGallery.innerHTML = '';

        const imageObserver = this.getGallerySliceObserver('_comitbaseObserver', { append, rootMargin: '50px' });
        const fragment = document.createDocumentFragment();
        photosToShow.forEach((photo, index) => {
            fragment.appendChild(this.createMasonryItemElement(photo, index, imageObserver, {
                isDtreasureCard: false,
            }));
        });

        elements.comitbaseGallery.appendChild(fragment);
        this.setupComitbaseEventListeners();
        this.updateComitbasePagination(displayPhotos.length);
    },

    loadMoreComitbase() {
        this.loadMoreSection(this.getComitbaseDisplayPhotos(), 'currentComitbasePage', (opts) => this.renderComitbaseGallery(opts));
    },

    setupComitbaseEventListeners() {
        this.bindMasonryDelegation(elements.comitbaseGallery, 'comitbaseClickHandler', () => state.comitbasePhotos);
    },

    updateComitbasePagination(totalOverride = null) {
        const totalItems = totalOverride !== null ? totalOverride : this.getComitbaseDisplayPhotos().length;
        this.updateSectionPagination({
            containerEl: elements.comitbasePagination || document.getElementById('comitbase-pagination'),
            loadMoreEl:  elements.comitbaseLoadMore || document.getElementById('comitbase-load-more'),
            totalItems,
            currentPage: state.currentComitbasePage,
            observerKey: '_comitbaseInfiniteObserver',
            ids: {
                sentinel:    'comitbase-infinite-sentinel',
                loadedInfo:  'comitbase-loaded-info',
                loadMoreBtn: 'comitbase-load-more-btn',
                pageInfo:    'comitbase-page-info',
                prevBtn:     'comitbase-prev',
                nextBtn:     'comitbase-next',
            },
            onLoadMore: () => this.loadMoreComitbase(),
        });
    },
});
