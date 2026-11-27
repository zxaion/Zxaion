/**
 * core/state.js — State aplikasi (class AppState + instance state) dan timer carousel.
 * Depends on: (tidak ada)
 */
// --- State Management ---
class AppState {
    constructor() {
        this.currentCategory      = 'All';
        this.currentAnimeAlbum    = null;
        this.currentPage          = 1;
        this.currentComitbasePage = 1;
        this.currentDtreasurePage = 1;
        this.allPhotos            = [];
        this.comitbasePhotos      = [];
        this.dtreasurePhotos      = [];
        this.comitbaseError       = false;
        this.dtreasureError       = false;
        this.animeAlbums          = {};
        this.animeAlbumCounts     = {};
        this.animeAlbumThumbs     = {};
        this.animeAlbumServerList = [];
        this.filteredPhotos       = [];
        this.currentImageId       = null;
        this.credits              = 0;
        this.lifetime             = false;
        this.purchasedImages      = new Set();
        this.searchQuery          = '';
        this.selectedCreditPack   = null;
        this.sortBy               = 'latest';
        this.aspectFilter         = 'all';
        this.dtreasureTab         = 'all';
        this.browseMode           = (() => {
            try {
                return localStorage.getItem('zxaion_browse_mode') === 'infinite' ? 'infinite' : 'pagination';
            } catch {
                return 'pagination';
            }
        })();
        this.photoRatios          = {};
        this.selectedResolution   = 'original';
        this.adminToken           = (() => {
            try {
                return sessionStorage.getItem('zx_admin_token') || localStorage.getItem('zx_admin_token') || null;
            } catch {
                return null;
            }
        })();
        this.adminData            = null;
        this.adminActiveTab       = 'orders';
        this.adminSearch          = '';
        this.account              = null;
        this.accountLedger        = [];
        this.accountOrders        = [];
        this.accountSessions      = [];
        this.accountActiveTab     = 'overview';
        this.accountLedgerFilter  = '';
        this.requiresLogin        = false;
        this.carouselMode         = 'trending';
        this.lovedPhotos          = new Set();
        this.photoLoveCounts      = {};
        this.currentMockupMode    = 'original';
        this.adminEditTargetUser  = null;
    }

    resetPagination() {
        this.currentPage          = 1;
        this.currentComitbasePage = 1;
        this.currentDtreasurePage = 1;
    }
}

const VIEW_STATE_STORAGE_KEY = 'zxaion_view_state';
const DEFAULT_CATEGORIES = ['All', 'Anime', 'Fantasy', 'Abstract', 'Photography', 'COMITBASE', 'DTREASURE', 'ZMEME', 'OVERLAY'];

const viewState = {
    normalizeCategory(raw, validCategories = null) {
        const list = Array.isArray(validCategories) && validCategories.length > 0
            ? validCategories
            : (typeof CATEGORIES !== 'undefined' && Array.isArray(CATEGORIES) ? CATEGORIES : DEFAULT_CATEGORIES);
        if (!raw || typeof raw !== 'string') return 'All';
        const trimmed = raw.trim().toLowerCase();
        const found = list.find(c => String(c).toLowerCase() === trimmed);
        return found || 'All';
    },

    normalizePositiveInt(raw, fallback = 1) {
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n >= 1 ? n : fallback;
    },

    normalizeAspect(raw) {
        const allowed = new Set(['all', 'portrait', 'landscape', 'square']);
        const v = String(raw || '').trim().toLowerCase();
        return allowed.has(v) ? v : 'all';
    },

    snapshotFromState(st) {
        const category = this.normalizeCategory(st?.currentCategory);
        return {
            category,
            animeAlbum:    category === 'Anime' && st?.currentAnimeAlbum ? String(st.currentAnimeAlbum) : null,
            dtreasureTab:  st?.dtreasureTab === 'library' ? 'library' : 'all',
            page:          this.normalizePositiveInt(st?.currentPage, 1),
            comitbasePage: this.normalizePositiveInt(st?.currentComitbasePage, 1),
            dtreasurePage: this.normalizePositiveInt(st?.currentDtreasurePage, 1),
            aspectFilter:  this.normalizeAspect(st?.aspectFilter),
        };
    },

    parseInitialView({ search = '', storageJson = null, validCategories = null } = {}) {
        let saved = null;
        if (storageJson && typeof storageJson === 'string') {
            try {
                const parsed = JSON.parse(storageJson);
                if (parsed && typeof parsed === 'object') saved = parsed;
            } catch {
                saved = null;
            }
        }

        const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
        const urlCatRaw = params.get('cat') || params.get('category');
        const hasUrlCat = Boolean(urlCatRaw && urlCatRaw.trim());

        const category = hasUrlCat
            ? this.normalizeCategory(urlCatRaw, validCategories)
            : this.normalizeCategory(saved?.category, validCategories);

        const urlAlbum = params.get('album');
        const animeAlbum = category === 'Anime'
            ? (urlAlbum ? urlAlbum.trim() : (!hasUrlCat && saved?.category === 'Anime' && saved?.animeAlbum ? String(saved.animeAlbum) : null))
            : null;

        const urlTab = params.get('tab');
        const dtreasureTab = urlTab
            ? (urlTab === 'library' ? 'library' : 'all')
            : (saved?.dtreasureTab === 'library' ? 'library' : 'all');

        const urlPage = params.has('page') ? this.normalizePositiveInt(params.get('page'), 1) : null;
        const page = (category !== 'COMITBASE' && category !== 'DTREASURE' && urlPage)
            ? urlPage
            : this.normalizePositiveInt(saved?.page, 1);
        const comitbasePage = (category === 'COMITBASE' && urlPage)
            ? urlPage
            : this.normalizePositiveInt(saved?.comitbasePage, 1);
        const dtreasurePage = (category === 'DTREASURE' && urlPage)
            ? urlPage
            : this.normalizePositiveInt(saved?.dtreasurePage, 1);

        const aspectFilter = params.has('ratio')
            ? this.normalizeAspect(params.get('ratio'))
            : this.normalizeAspect(saved?.aspectFilter);

        return {
            category,
            animeAlbum: animeAlbum || null,
            dtreasureTab,
            page,
            comitbasePage,
            dtreasurePage,
            aspectFilter,
        };
    },

    buildUrlSearch(view, existingSearch = '') {
        const params = new URLSearchParams(String(existingSearch || '').replace(/^\?/, ''));
        params.delete('cat');
        params.delete('category');
        params.delete('album');
        params.delete('tab');
        params.delete('page');
        params.delete('ratio');

        const category = this.normalizeCategory(view?.category);
        if (category !== 'All') {
            params.set('cat', category);
        }
        if (category === 'Anime' && view?.animeAlbum) {
            params.set('album', view.animeAlbum);
        }
        if (category === 'DTREASURE' && view?.dtreasureTab === 'library') {
            params.set('tab', 'library');
        }
        const activePage = category === 'COMITBASE'
            ? this.normalizePositiveInt(view?.comitbasePage, 1)
            : (category === 'DTREASURE'
                ? this.normalizePositiveInt(view?.dtreasurePage, 1)
                : this.normalizePositiveInt(view?.page, 1));
        if (activePage > 1) {
            params.set('page', String(activePage));
        }
        if (view?.aspectFilter && view.aspectFilter !== 'all') {
            params.set('ratio', view.aspectFilter);
        }

        const qs = params.toString();
        return qs ? `?${qs}` : '';
    },
};

function saveViewState() {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/admin' || window.location.hash === '#admin') return;
    const snap = viewState.snapshotFromState(state);
    try {
        window.sessionStorage?.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(snap));
    } catch (_) {}
    try {
        const nextSearch = viewState.buildUrlSearch(snap, window.location.search);
        const hash = window.location.hash || '';
        const target = `${window.location.pathname}${nextSearch}${hash}`;
        const current = `${window.location.pathname}${window.location.search}${hash}`;
        if (target !== current && typeof window.history?.replaceState === 'function') {
            window.history.replaceState(null, '', target);
        }
    } catch (_) {}
}

function loadInitialViewState() {
    if (typeof window === 'undefined') {
        return viewState.parseInitialView({});
    }
    let storageJson = null;
    try {
        storageJson = window.sessionStorage?.getItem(VIEW_STATE_STORAGE_KEY) || null;
    } catch (_) {}
    return viewState.parseInitialView({
        search: window.location.search || '',
        storageJson,
    });
}

const state = new AppState();

// Timer untuk auto-refresh ranking carousel — dibersihkan saat ganti kategori.
let _carouselRefreshTimer = null;
