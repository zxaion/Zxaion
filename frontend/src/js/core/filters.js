/**
 * core/filters.js — Pure helpers untuk sorting, filter rasio layar, library DTREASURE, dan slice pagination/infinite scroll.
 * Depends on: (tidak ada)
 */
function classifyAspectRatio(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return 'unknown';
    }
    const ratio = w / h;
    if (ratio <= 0.85) return 'portrait';
    if (ratio >= 1.18) return 'landscape';
    return 'square';
}

function parsePhotoTimestamp(raw) {
    if (!raw) return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    const str = String(raw).trim();
    if (!str) return 0;
    // Normalize SQLite "YYYY-MM-DD HH:MM:SS" into ISO UTC for cross-browser Date.parse compatibility
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(str)
        ? `${str.replace(' ', 'T')}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(str) ? '' : 'Z'}`
        : str;
    const ts = Date.parse(normalized);
    return Number.isFinite(ts) ? ts : 0;
}

function sortPhotosList(photos, sortBy = 'latest', shuffleFn = null) {
    const list = Array.isArray(photos) ? [...photos] : [];
    switch (sortBy) {
        case 'views':
            return list.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        case 'loved':
            return list.sort((a, b) => (b.loveCount || 0) - (a.loveCount || 0));
        case 'downloads':
            return list.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
        case 'random': {
            if (typeof shuffleFn === 'function') return shuffleFn(list);
            for (let i = list.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [list[i], list[j]] = [list[j], list[i]];
            }
            return list;
        }
        case 'latest':
        default:
            return list.sort((a, b) => {
                const diff = parsePhotoTimestamp(b && b.uploaded) - parsePhotoTimestamp(a && a.uploaded);
                if (diff !== 0) return diff;
                return String((b && b.id) || '').localeCompare(String((a && a.id) || ''));
            });
    }
}

function getPhotoAspectCategory(photo, ratioMap = {}) {
    if (!photo) return 'unknown';
    if (photo.aspectRatio && photo.aspectRatio !== 'unknown') return photo.aspectRatio;
    if (photo.id && ratioMap[photo.id] && ratioMap[photo.id] !== 'unknown') return ratioMap[photo.id];
    return classifyAspectRatio(photo.width, photo.height);
}

function filterPhotosByRatio(photos, ratioFilter = 'all', ratioMap = {}) {
    const list = Array.isArray(photos) ? photos : [];
    if (!ratioFilter || ratioFilter === 'all') return [...list];
    return list.filter((photo) => getPhotoAspectCategory(photo, ratioMap) === ratioFilter);
}

function filterDtreasureLibrary(photos, { tab = 'all', purchasedSet = new Set(), lifetime = false } = {}) {
    const list = Array.isArray(photos) ? photos : [];
    if (tab !== 'library') return [...list];
    if (lifetime) return [...list];
    const hasFn = purchasedSet && typeof purchasedSet.has === 'function';
    return list.filter((photo) => hasFn && purchasedSet.has(photo.id));
}

function getPaginationSliceInfo(totalItems, currentPage = 1, itemsPerPage = 30, browseMode = 'pagination') {
    const total = Math.max(0, Number(totalItems) || 0);
    const perPage = Math.max(1, Number(itemsPerPage) || 30);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(totalPages, Math.max(1, Number(currentPage) || 1));

    if (browseMode === 'infinite') {
        const end = Math.min(total, safePage * perPage);
        return {
            start: 0,
            end,
            page: safePage,
            totalPages,
            total,
            hasMore: end < total,
            remaining: Math.max(0, total - end),
        };
    }

    const start = (safePage - 1) * perPage;
    const end = Math.min(total, start + perPage);
    return {
        start,
        end,
        page: safePage,
        totalPages,
        total,
        hasMore: safePage < totalPages,
        remaining: Math.max(0, total - end),
    };
}

const galleryFilters = {
    classifyAspectRatio,
    sortPhotosList,
    getPhotoAspectCategory,
    filterPhotosByRatio,
    filterDtreasureLibrary,
    getPaginationSliceInfo,
};

if (typeof window !== 'undefined') {
    window.galleryFilters = galleryFilters;
}
