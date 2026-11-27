/**
 * ui/base.js — Membuat objek `ui` + empty state / no-results / toast non-blocking / jumlah album ORIGINAL.
 * Depends on: elements, utils
 */
// --- UI Functions ---
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

    showToast(message, type = 'info', duration = 4000) {
        const existing = document.getElementById('app-toast');
        if (existing) existing.remove();

        const colorMap = {
            success: 'bg-green-700 text-white',
            error:   'bg-red-700 text-white',
            warning: 'bg-amber-600 text-white',
            info:    'bg-gray-900 text-white dark:bg-gray-800',
        };
        const iconMap = {
            success: 'fa-check-circle text-green-300',
            error:   'fa-exclamation-circle text-red-200',
            warning: 'fa-exclamation-triangle text-amber-200',
            info:    'fa-info-circle text-blue-300',
        };

        const toast = document.createElement('div');
        toast.id        = 'app-toast';
        toast.className = `fixed bottom-6 right-6 z-[9999] max-w-sm px-5 py-3.5 rounded-xl shadow-2xl text-sm font-semibold flex items-start gap-2.5 ${colorMap[type] || colorMap.info}`;
        toast.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info} mt-0.5 flex-shrink-0"></i><span class="whitespace-pre-line">${utils.escapeHtml(message)}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (document.body.contains(toast)) toast.remove();
        }, duration);
    },

    showToolbar() {
        (elements.galleryToolbar || document.getElementById('gallery-toolbar'))?.classList.remove('hidden');
        this.syncToolbarUI();
    },

    hideToolbar() {
        (elements.galleryToolbar || document.getElementById('gallery-toolbar'))?.classList.add('hidden');
    },

    updateToolbarCount(count) {
        const el = elements.toolbarResultCount || document.getElementById('toolbar-result-count');
        if (el) el.textContent = `${Number(count || 0).toLocaleString()} item${count === 1 ? '' : 's'}`;
    },

    syncToolbarUI() {
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === state.sortBy);
        });
        document.querySelectorAll('.ratio-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.ratio === state.aspectFilter);
        });
        const modeLabel = elements.browseModeLabel || document.getElementById('browse-mode-label');
        if (modeLabel) {
            modeLabel.textContent = state.browseMode === 'infinite' ? 'Mode: Infinite' : 'Mode: Pages';
        }
    },

    recordPhotoDimensions(photo, img) {
        if (!photo || !img) return;
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        if (w <= 0 || h <= 0) return;
        photo.width = w;
        photo.height = h;
        const ratio = galleryFilters.classifyAspectRatio(w, h);
        photo.aspectRatio = ratio;
        state.photoRatios[photo.id] = ratio;
    },

    async probeMissingRatios(photos, onUpdated) {
        if (!Array.isArray(photos) || photos.length === 0) return;
        const missing = photos.filter(p => galleryFilters.getPhotoAspectCategory(p, state.photoRatios) === 'unknown');
        if (missing.length === 0) return;

        const token = ++this._probeToken || (this._probeToken = 1);
        const CONCURRENCY = 6;
        let index = 0;
        let updatedAny = false;

        const worker = async () => {
            while (index < missing.length && this._probeToken === token) {
                const photo = missing[index++];
                if (!photo || !photo.url) continue;
                await new Promise((resolve) => {
                    const probe = new Image();
                    const probeCandidates = utils.getImageFallbackCandidates(photo.url, { w: 64, q: 30, fit: 'scale-down', fmt: 'auto' });
                    const done = () => {
                        probe.onload = null;
                        probe.onerror = null;
                        resolve();
                    };
                    const firstProbeUrl = utils.attachImageFallback(probe, probeCandidates, {
                        onLoadSuccess(el) {
                            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                                ui.recordPhotoDimensions(photo, el);
                                updatedAny = true;
                            }
                            done();
                        },
                        onFinalError: done,
                    });
                    probe.src = firstProbeUrl;
                });
            }
        };

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
        if (updatedAny && this._probeToken === token && typeof onUpdated === 'function') {
            onUpdated();
        }
    },

    setupInfiniteSentinel(sentinelId, observerKey, hasMore, onIntersect) {
        if (this[observerKey]) {
            this[observerKey].disconnect();
            this[observerKey] = null;
        }
        if (!hasMore || state.browseMode !== 'infinite') return;
        const sentinel = document.getElementById(sentinelId);
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) {
                observer.disconnect();
                onIntersect();
            }
        }, { rootMargin: '250px' });

        observer.observe(sentinel);
        this[observerKey] = observer;
    },

    setModalOpen(modalElOrId, isOpen, { lockScroll = true } = {}) {
        const modal = typeof modalElOrId === 'string'
            ? document.getElementById(modalElOrId)
            : modalElOrId;
        if (!modal) return null;
        modal.classList.toggle('hidden', !isOpen);
        modal.classList.toggle('flex', isOpen);
        if (lockScroll) {
            document.body.style.overflow = isOpen ? 'hidden' : '';
        }
        return modal;
    },

    recordPhotoDownload(photo) {
        if (!photo) return;
        photo.downloadCount = (photo.downloadCount || 0) + 1;
        api.recordDownload(photo.id);
        const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(photo.id) : photo.id;
        document.querySelectorAll(`.download-count[data-id="${safeId}"]`).forEach(el => {
            el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
        });
        if (state.currentImageId === photo.id && elements.modalDownloadCount) {
            elements.modalDownloadCount.textContent = utils.formatNumber(photo.downloadCount);
        }
    },

    syncLoveUi(photoId, loveCount, isLoved) {
        if (!photoId) return;
        const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(photoId) : photoId;
        const countText = utils.formatNumber(Math.max(0, Number(loveCount) || 0));

        document.querySelectorAll(`.love-count[data-id="${safeId}"]`).forEach(el => {
            el.textContent = countText;
        });
        document.querySelectorAll(`.love-btn[data-id="${safeId}"]`).forEach(btn => {
            btn.classList.toggle('is-loved', Boolean(isLoved));
            btn.setAttribute('aria-pressed', isLoved ? 'true' : 'false');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = `${isLoved ? 'fas' : 'far'} fa-heart`;
            }
        });

        if (state.currentImageId === photoId) {
            const modalCount = document.getElementById('modal-love-count');
            const modalBtn = document.getElementById('modal-love-btn');
            const modalIcon = document.getElementById('modal-love-icon');
            if (modalCount) modalCount.textContent = countText;
            if (modalBtn) {
                modalBtn.setAttribute('aria-pressed', isLoved ? 'true' : 'false');
                modalBtn.classList.toggle('bg-rose-500', Boolean(isLoved));
                modalBtn.classList.toggle('text-white', Boolean(isLoved));
                modalBtn.classList.toggle('dark:bg-rose-600', Boolean(isLoved));
                modalBtn.classList.toggle('dark:text-white', Boolean(isLoved));
                modalBtn.classList.toggle('bg-rose-50', !isLoved);
                modalBtn.classList.toggle('text-rose-600', !isLoved);
                modalBtn.classList.toggle('dark:bg-rose-900/30', !isLoved);
                modalBtn.classList.toggle('dark:text-rose-300', !isLoved);
            }
            if (modalIcon) {
                modalIcon.className = `${isLoved ? 'fas' : 'far'} fa-heart text-xs ${isLoved ? 'text-white' : 'text-rose-500'}`;
            }
        }
    },

    async togglePhotoLove(photo) {
        if (!photo || !photo.id) return;
        const prevLoved = state.lovedPhotos.has(photo.id);
        const prevCount = Number(photo.loveCount || state.photoLoveCounts[photo.id] || 0);
        const nextLoved = !prevLoved;
        const optimisticCount = Math.max(0, prevCount + (nextLoved ? 1 : -1));

        if (nextLoved) state.lovedPhotos.add(photo.id);
        else state.lovedPhotos.delete(photo.id);
        photo.loveCount = optimisticCount;
        state.photoLoveCounts[photo.id] = optimisticCount;
        this.syncLoveUi(photo.id, optimisticCount, nextLoved);

        if (typeof api.toggleReaction === 'function') {
            const res = await api.toggleReaction(photo.id);
            if (res && res.success) {
                if (res.loved) state.lovedPhotos.add(photo.id);
                else state.lovedPhotos.delete(photo.id);
                photo.loveCount = res.loveCount;
                state.photoLoveCounts[photo.id] = res.loveCount;
                this.syncLoveUi(photo.id, res.loveCount, res.loved);
                if (state.sortBy === 'loved') {
                    this.invalidateMainSortCache?.();
                    this.invalidateComitbaseSortCache?.();
                    this.invalidateDtreasureSortCache?.();
                }
            }
        }
    },

    _sortCaches: {},

    invalidateSortCache(cacheKey) {
        delete this._sortCaches[cacheKey];
    },

    getCachedSortedPhotos(cacheKey, list, signature) {
        const cached = this._sortCaches[cacheKey];
        if (cached && cached.key === signature && Array.isArray(cached.items)) {
            return cached.items;
        }
        const sorted = galleryFilters.sortPhotosList(list, state.sortBy, utils.shuffleArray);
        this._sortCaches[cacheKey] = { key: signature, items: sorted };
        return sorted;
    },

    getGallerySliceObserver(observerKey, { append = false, rootMargin = '500px 0px' } = {}) {
        if (!append && this[observerKey]) {
            this[observerKey].disconnect();
        }
        if (!this[observerKey] || !append) {
            this[observerKey] = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
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
                });
            }, { rootMargin });
        }
        return this[observerKey];
    },

    renderRatioEmptyBanner(container, contextLabel) {
        if (!container) return;
        container._masonryCols = null;
        container.innerHTML = `
        <div class="w-full col-span-full text-center py-16 bg-white/70 dark:bg-gray-900/70 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
            <i class="fas fa-crop-simple text-3xl text-gray-400 mb-3"></i>
            <p class="text-gray-600 dark:text-gray-300 font-semibold mb-3">No ${utils.escapeHtml(state.aspectFilter)} wallpapers found in ${utils.escapeHtml(contextLabel)} yet.</p>
            <button type="button" data-action="reset-aspect-filter" class="px-5 py-2 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 cursor-pointer dark:bg-white dark:text-black">
                Show All Ratios
            </button>
        </div>`;
    },

    renderBucketErrorOrEmpty(container, { isError, retryAction, errorLabel, emptyIcon, emptyLabel }) {
        if (!container) return;
        container._masonryCols = null;
        container.innerHTML = isError
            ? `<div class="w-full col-span-full text-center py-20">
                <div class="w-20 h-20 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <i class="fas fa-exclamation-triangle text-3xl text-red-500"></i>
                </div>
                <p class="text-gray-700 dark:text-gray-200 font-semibold mb-4">${utils.escapeHtml(errorLabel)}</p>
                <button type="button" data-action="${utils.escapeHtml(retryAction)}" class="px-5 py-2.5 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 cursor-pointer dark:bg-white dark:text-black">
                    <i class="fas fa-sync-alt mr-1.5"></i>Try Again
                </button>
            </div>`
            : `<div class="w-full col-span-full text-center py-20">
                <div class="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center dark:bg-gray-700">
                    <i class="fas ${utils.escapeHtml(emptyIcon)} text-3xl text-gray-400"></i>
                </div>
                <p class="text-gray-500 dark:text-gray-400">${utils.escapeHtml(emptyLabel)}</p>
            </div>`;
    },

    bindMasonryDelegation(container, handlerKey, getListFn) {
        if (!container) return;
        if (this[handlerKey]) {
            container.removeEventListener('click', this[handlerKey]);
        }
        const handler = (e) => {
            const loveBtn = e.target.closest('.love-btn');
            const downloadBtn = e.target.closest('.download-btn');
            const item = (loveBtn || downloadBtn || e.target).closest('.masonry-item');
            if (!item) return;
            const photoId = item.dataset.photoId;
            const photo = getListFn().find(p => p.id === photoId);
            if (!photo) return;
            if (loveBtn) {
                e.stopPropagation();
                ui.togglePhotoLove(photo);
            } else if (downloadBtn) {
                e.stopPropagation();
                ui.handleDownload(photo);
            } else {
                ui.openImageModal(photo);
            }
        };
        this[handlerKey] = handler;
        container.addEventListener('click', handler);
    },

    createMasonryItemElement(photo, index, imageObserver, {
        isDtreasureCard = false,
        fallbackTitle = '',
        authImageLoader = utils.loadAuthenticatedImage,
    } = {}) {
        const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';
        const errorSvg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';

        const item = document.createElement('div');
        item.className = 'masonry-item fade-in';
        item.style.animationDelay = `${Math.min(index, 12) * 35}ms`;
        item.dataset.photoId = photo.id;

        const isFree = !isDtreasureCard || state.lifetime || state.purchasedImages.has(photo.id);
        const useAuthLoad = isDtreasureCard && isFree && typeof authImageLoader === 'function';
        const transformOpts = isDtreasureCard
            ? (isFree ? { w: 640, q: 80, fit: 'scale-down', fmt: 'auto' } : { w: 520, q: 75, fit: 'scale-down', fmt: 'auto' })
            : { w: 520, q: 78, fit: 'scale-down', fmt: 'auto' };
        const candidates    = utils.getImageFallbackCandidates(photo.url, transformOpts);
        const fullUrl       = candidates[0] || '';
        const isAboveFold   = index < 6;
        const loadingAttr   = isAboveFold ? 'eager' : 'lazy';
        const fetchPrioAttr = index < 4 ? ' fetchpriority="high"' : '';
        const safePhotoId   = utils.escapeHtml(photo.id);
        const safeAlt       = utils.escapeHtml(photo.title) || fallbackTitle;
        const viewCount     = utils.formatNumber(photo.viewCount || 0);
        const downloadCount = utils.formatNumber(photo.downloadCount || 0);
        const loveNum       = Number(state.photoLoveCounts?.[photo.id] ?? photo.loveCount ?? 0);
        const loveCount     = utils.formatNumber(loveNum);
        const isLoved       = Boolean(state.lovedPhotos?.has(photo.id));
        const buttonText    = isFree ? 'Download' : '10 Credits';
        const buttonIcon    = isFree ? 'fa-download' : 'fa-lock';
        const knownW        = Number(photo.width) > 0 ? Math.round(Number(photo.width)) : 0;
        const knownH        = Number(photo.height) > 0 ? Math.round(Number(photo.height)) : 0;
        const dimAttrs      = knownW > 0 && knownH > 0 ? ` width="${knownW}" height="${knownH}"` : '';
        const aspectCss     = knownW > 0 && knownH > 0 ? `aspect-ratio:${knownW}/${knownH};` : '';

        const srcAttr = useAuthLoad
            ? `src="${placeholderSvg}"`
            : (isAboveFold
                ? `src="${utils.escapeHtml(fullUrl || placeholderSvg)}"`
                : `src="${placeholderSvg}" data-src="${utils.escapeHtml(fullUrl)}"`);

        const imgHtml = isDtreasureCard
            ? `<div class="relative" style="line-height:0;">
                ${isFree ? '<span class="dtreasure-unlocked-badge absolute top-2.5 left-2.5 z-[2] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[10px] font-black uppercase tracking-wider shadow-md backdrop-blur-sm"><i class="fas fa-unlock"></i> Unlocked</span>' : ''}
                <img
                    ${srcAttr}
                    alt="${safeAlt}"${dimAttrs}
                    loading="${loadingAttr}"${fetchPrioAttr}
                    class="loading-shimmer w-full h-auto select-none"
                    decoding="async"
                    draggable="false"
                    style="${aspectCss} -webkit-user-drag:none; ${isFree ? '' : '-webkit-touch-callout:none;'} user-select:none;">
                ${isFree ? '' : '<div class="dtreasure-thumb-shield absolute inset-0 z-[1]" style="-webkit-tap-highlight-color:transparent; cursor:pointer;"></div>'}
               </div>`
            : `<img
                ${srcAttr}
                alt="${safeAlt}"${dimAttrs}
                loading="${loadingAttr}"${fetchPrioAttr}
                class="loading-shimmer w-full h-auto"
                decoding="async"
                ${aspectCss ? `style="${aspectCss}"` : ''}>`;

        item.innerHTML = `
        ${imgHtml}
        <div class="masonry-overlay"${isDtreasureCard ? ' style="z-index:2;"' : ''}>
            <div class="stats">
                <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${safePhotoId}">${viewCount}</span></span>
                <span><i class="fas fa-download"></i> <span class="download-count" data-id="${safePhotoId}">${downloadCount}</span></span>
                <span><i class="fas fa-heart text-rose-400"></i> <span class="love-count" data-id="${safePhotoId}">${loveCount}</span></span>
            </div>
            <div class="card-actions">
                <button class="download-btn" type="button">
                    <i class="fas ${buttonIcon}"></i> ${buttonText}
                </button>
                <button class="love-btn${isLoved ? ' is-loved' : ''}" type="button" data-id="${safePhotoId}" aria-label="Love ${safeAlt}" aria-pressed="${isLoved ? 'true' : 'false'}">
                    <i class="${isLoved ? 'fas' : 'far'} fa-heart"></i>
                </button>
            </div>
        </div>`;

        const img = item.querySelector('img');
        if (useAuthLoad) {
            const triggerAuthLoad = () => {
                authImageLoader(img, photo.url, transformOpts, {
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
            if (isAboveFold) {
                triggerAuthLoad();
            } else {
                img._lazyLoadFn = triggerAuthLoad;
                imageObserver.observe(img);
            }
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
            if (!isAboveFold) {
                imageObserver.observe(img);
            }
        }
        return item;
    },

    getMasonryColumnCount() {
        const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
        if (w >= 1536) return 5;
        if (w >= 1024) return 4;
        if (w >= 640) return 3;
        return 2;
    },

    _initMasonryResizeListener() {
        if (this._masonryResizeBound || typeof window === 'undefined') return;
        this._masonryResizeBound = true;
        window.addEventListener('resize', () => {
            const targetCols = this.getMasonryColumnCount();
            document.querySelectorAll('.masonry-layout').forEach((container) => {
                if (!container._masonryCols || container._masonryColCount === targetCols) return;
                this.reflowMasonryContainer(container, targetCols);
            });
        }, { passive: true });
    },

    reflowMasonryContainer(container, targetCols = this.getMasonryColumnCount()) {
        if (!container || !container._masonryCols) return;
        const items = Array.from(container.querySelectorAll('.masonry-item'))
            .sort((a, b) => (Number(a.dataset.masonryIndex) || 0) - (Number(b.dataset.masonryIndex) || 0));

        const cols = Array.from({ length: targetCols }, () => {
            const col = document.createElement('div');
            col.className = 'masonry-column';
            return col;
        });
        const heights = new Array(targetCols).fill(0);

        items.forEach((item) => {
            let bestCol = 0;
            for (let c = 1; c < targetCols; c++) {
                if (heights[c] < heights[bestCol] - 1e-6) bestCol = c;
            }
            cols[bestCol].appendChild(item);
            const aspect = parseFloat(item.dataset.masonryAspect || '1');
            heights[bestCol] += Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
        });

        const frag = document.createDocumentFragment();
        cols.forEach((col) => frag.appendChild(col));
        container.innerHTML = '';
        container.appendChild(frag);
        container._masonryCols = cols;
        container._masonryColHeights = heights;
        container._masonryColCount = targetCols;
        container._masonryNextIdx = items.length;
    },

    renderMasonryItems(container, photosToShow, { append = false, startIndex = 0, imageObserver, getItemOptions } = {}) {
        if (!container) return;
        this._initMasonryResizeListener();

        const colCount = this.getMasonryColumnCount();
        if (!append || !Array.isArray(container._masonryCols) || container._masonryCols.length !== colCount) {
            if (append && Array.isArray(container._masonryCols)) {
                this.reflowMasonryContainer(container, colCount);
            } else {
                const cols = Array.from({ length: colCount }, () => {
                    const col = document.createElement('div');
                    col.className = 'masonry-column';
                    return col;
                });
                const frag = document.createDocumentFragment();
                cols.forEach((col) => frag.appendChild(col));
                container.innerHTML = '';
                container.appendChild(frag);
                container._masonryCols = cols;
                container._masonryColHeights = new Array(colCount).fill(0);
                container._masonryColCount = colCount;
                container._masonryNextIdx = 0;
            }
        }

        const cols = container._masonryCols;
        const heights = container._masonryColHeights;
        const colFragments = Array.from({ length: colCount }, () => document.createDocumentFragment());

        photosToShow.forEach((photo, idx) => {
            const globalIdx = append ? (startIndex + idx) : idx;
            const opts = typeof getItemOptions === 'function' ? getItemOptions(photo, globalIdx) : {};
            const item = this.createMasonryItemElement(photo, globalIdx, imageObserver, opts);
            const aspect = (photo && Number(photo.width) > 0 && Number(photo.height) > 0)
                ? Math.min(2.4, Math.max(0.4, Number(photo.height) / Number(photo.width)))
                : 1;
            const seqIdx = container._masonryNextIdx++;
            item.dataset.masonryIndex = String(seqIdx);
            item.dataset.masonryAspect = aspect.toFixed(3);

            let bestCol = 0;
            for (let c = 1; c < colCount; c++) {
                if (heights[c] < heights[bestCol] - 1e-6) bestCol = c;
            }
            colFragments[bestCol].appendChild(item);
            heights[bestCol] += aspect;
        });

        colFragments.forEach((frag, c) => {
            if (frag.childNodes.length > 0) cols[c].appendChild(frag);
        });
    },

    loadMoreSection(displayPhotos, pageStateKey, renderFn) {
        const prevSlice = galleryFilters.getPaginationSliceInfo(
            displayPhotos.length,
            state[pageStateKey],
            ITEMS_PER_PAGE,
            'infinite'
        );
        if (!prevSlice.hasMore) return;
        state[pageStateKey]++;
        renderFn({ append: true, previousCount: prevSlice.end });
    },

    updateSectionPagination({ containerEl, loadMoreEl, totalItems, currentPage, ids, observerKey, onLoadMore }) {
        const slice = galleryFilters.getPaginationSliceInfo(totalItems, currentPage, ITEMS_PER_PAGE, state.browseMode);

        if (totalItems === 0 || slice.totalPages <= 1) {
            if (containerEl) containerEl.classList.add('hidden');
            if (loadMoreEl) loadMoreEl.classList.add('hidden');
            this.setupInfiniteSentinel(ids.sentinel, observerKey, false, () => {});
            return;
        }

        if (state.browseMode === 'infinite') {
            if (containerEl) containerEl.classList.add('hidden');
            if (loadMoreEl) {
                loadMoreEl.classList.remove('hidden');
                const loadedInfo = document.getElementById(ids.loadedInfo);
                const loadMoreBtn = document.getElementById(ids.loadMoreBtn);
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
            this.setupInfiniteSentinel(ids.sentinel, observerKey, slice.hasMore, onLoadMore);
            return;
        }

        this.setupInfiniteSentinel(ids.sentinel, observerKey, false, () => {});
        if (loadMoreEl) loadMoreEl.classList.add('hidden');
        if (!containerEl) return;

        containerEl.classList.remove('hidden');
        const pageInfo = document.getElementById(ids.pageInfo);
        if (pageInfo) pageInfo.textContent = `Page ${slice.page} of ${slice.totalPages}`;
        const prevBtn = document.getElementById(ids.prevBtn);
        const nextBtn = document.getElementById(ids.nextBtn);
        if (prevBtn) prevBtn.disabled = slice.page <= 1;
        if (nextBtn) nextBtn.disabled = slice.page >= slice.totalPages;
    },

    async refreshImages() {
        this.hideEmptyState();
        const success = await api.fetchImages();
        if (success) this.changeCategory(state.currentCategory);
    },

    resetAspectFilter() {
        state.aspectFilter = 'all';
        state.resetPagination();
        this.syncToolbarUI();
        if (typeof saveViewState === 'function') saveViewState();
        if (state.currentCategory === 'COMITBASE') this.renderComitbaseGallery();
        else if (state.currentCategory === 'DTREASURE') this.renderDtreasureGallery();
        else this.renderGallery();
    },

    switchDtreasureTab(tab) {
        state.dtreasureTab = tab === 'library' ? 'library' : 'all';
        state.currentDtreasurePage = 1;
        if (typeof saveViewState === 'function') saveViewState();
        this.invalidateDtreasureSortCache?.();
        this.renderDtreasureGallery?.();
    },
};
