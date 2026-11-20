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
                    const done = () => {
                        probe.onload = null;
                        probe.onerror = null;
                        resolve();
                    };
                    probe.onload = () => {
                        if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
                            this.recordPhotoDimensions(photo, probe);
                            updatedAny = true;
                        }
                        done();
                    };
                    probe.onerror = done;
                    probe.src = utils.buildImageUrl(photo.url, { w: 64, q: 30, fit: 'scale-down', fmt: 'auto' });
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
};