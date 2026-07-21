// --- Configuration ---
const API_BASE = 'https://ai.zxaionverse.workers.dev';
const ITEMS_PER_PAGE = 30;
const CATEGORIES = ['All', 'Anime', 'Fantasy', 'Abstract', 'Photography', 'COMITBASE', 'DTREASURE', 'ZMEME', 'OVERLAY'];
const ANIME_SUB_ALBUMS = [
    'Attack on Titan', 'One Piece', 'My Hero Academia', 'Demon Slayer',
    'One-Punch Man', 'Death Note', 'Sousou no Frieren', 'Boruto',
    'Jujutsu Kaisen', 'Pokémon', 'Chainsaw Man', 'Fate Series',
    'Solo Leveling', 'Evangelion', 'Naruto', 'The Seven Deadly Sins',
    'Tokyo Ghoul', 'Sword Art Online', 'Dragon Ball Super', 'Haikyuu!!',
    'Fairy Tail', 'Hunter x Hunter', 'Black Clover', 'Dr. Stone',
    'HSR', 'GENSHIN', 'ZZZ', 'WUWA', 'PURAVEN', 'FINAL FANTASY',
    'RESIDENT EVIL', 'DEAD OR ALIVE', 'TOKYO REVENGER', 'FIRE FORCE',
    'ROMANCE ANIME', 'ISEKAI', 'ORIGINAL'
];

const CREDIT_PACKS = {
    '5$':   { credits: 200,  bonus: 0,    label: 'BASIC',        price: 5,   color: 'from-gray-400 to-gray-500' },
    '25$':  { credits: 1300, bonus: 450,  label: 'STANDARD',     price: 25,  color: 'from-blue-400 to-blue-500' },
    '45$':  { credits: 2700, bonus: 900,  label: 'PREMIUM',      price: 45,  color: 'from-violet-400 to-violet-500' },
    '75$':  { credits: 4500, bonus: 1400, label: 'ULTIMATE',     price: 75,  color: 'from-purple-400 to-purple-500' },
    '99$':  { credits: 7000, bonus: 2300, label: 'MEGA',         price: 99,  color: 'from-pink-400 to-rose-500' },
    '125$': { credits: 'lifetime', bonus: 0, label: 'LIFETIME PRO', price: 125, color: 'from-amber-400 to-orange-500' }
};

window.headerBackgrounds = {
    'All':         `${API_BASE}/api/img/HEADER/Home.jpg`,
    'Anime':       `${API_BASE}/api/img/HEADER/Anime.jpg`,
    'Fantasy':     `${API_BASE}/api/img/HEADER/Fantasy.jpg`,
    'Abstract':    `${API_BASE}/api/img/HEADER/Abstract.jpg`,
    'Photography': `${API_BASE}/api/img/PHOTOGRAPHY/PSX_207.jpg`,
    'COMITBASE':   `${API_BASE}/api/img/HEADER/Combaseheader.jpg`,
    'DTREASURE':   `${API_BASE}/api/img/HEADER/Dtreasure.jpg`,
    'ZMEME':       `${API_BASE}/api/img/HEADER/Memehead.jpg`,
    'OVERLAY':     `${API_BASE}/api/img/HEADER/Overlayhead.jpg`
};

window.categoryThumbnails = {
    'Anime':       `${API_BASE}/api/img/HEADER/Anime.jpg`,
    'Fantasy':     `${API_BASE}/api/img/HEADER/Fantasy.jpg`,
    'Abstract':    `${API_BASE}/api/img/HEADER/Abstract.jpg`,
    'Photography': `${API_BASE}/api/img/PHOTOGRAPHY/PSX_207.jpg`,
    'COMITBASE':   `${API_BASE}/api/img/HEADER/Combaseheader.jpg`,
    'DTREASURE':   `${API_BASE}/api/img/HEADER/Dtreasure1.jpg`,
    'ZMEME':       `${API_BASE}/api/img/HEADER/Zmeme.jpg`,
    'OVERLAY':     `${API_BASE}/api/img/HEADER/Overlay.jpg`
};

window.animeAlbumThumbnails = {
    'Attack on Titan':      `${API_BASE}/api/img/HEADER/AOT.jpg`,
    'One Piece':            `${API_BASE}/api/img/HEADER/One piece.jpg`,
    'My Hero Academia':     `${API_BASE}/api/img/HEADER/Hro academia.jpg`,
    'Demon Slayer':         `${API_BASE}/api/img/ANIME/Demon slayer/ai_generated_by_zxaionverse_djco3hq.jpg`,
    'One-Punch Man':        `${API_BASE}/api/img/HEADER/Onepuvhman.jpg`,
    'Death Note':           `${API_BASE}/api/img/HEADER/Deathnote.jpg`,
    'Sousou no Frieren':    `${API_BASE}/api/img/HEADER/Frieren.jpg`,
    'Boruto':               `${API_BASE}/api/img/HEADER/Boruto.jpg`,
    'Jujutsu Kaisen':       `${API_BASE}/api/img/HEADER/Jjk.jpg`,
    'Pokémon':              `${API_BASE}/api/img/HEADER/Pokemon.jpg`,
    'Chainsaw Man':         `${API_BASE}/api/img/HEADER/Chainsawman.jpg`,
    'Fate Series':          `${API_BASE}/api/img/ANIME/Fate series/PSX_193.jpg`,
    'Solo Leveling':        `${API_BASE}/api/img/HEADER/Sololeveling.jpg`,
    'Evangelion':           `${API_BASE}/api/img/HEADER/Evangelion.jpg`,
    'Naruto':               `${API_BASE}/api/img/HEADER/Naruti.jpg`,
    'The Seven Deadly Sins':`${API_BASE}/api/img/HEADER/Nanatsu.jpg`,
    'Tokyo Ghoul':          `${API_BASE}/api/img/HEADER/Ghoul.jpg`,
    'Sword Art Online':     `${API_BASE}/api/img/HEADER/SAO.jpg`,
    'Dragon Ball Super':    `${API_BASE}/api/img/HEADER/Goku.jpg`,
    'Haikyuu!!':            `${API_BASE}/api/img/HEADER/Haikyu.jpg`,
    'Fairy Tail':           `${API_BASE}/api/img/HEADER/Fairytail.jpg`,
    'Hunter x Hunter':      `${API_BASE}/api/img/HEADER/Hmterx hunter.jpg`,
    'Black Clover':         `${API_BASE}/api/img/HEADER/Vanesablack clover.jpg`,
    'Dr. Stone':            `${API_BASE}/api/img/HEADER/Dr stone.jpg`,
    'HSR':                  `${API_BASE}/api/img/HEADER/Hsr 1.jpg`,
    'GENSHIN':              `${API_BASE}/api/img/HEADER/1Genshin.jpg`,
    'ZZZ':                  `${API_BASE}/api/img/HEADER/Zzz 1.jpg`,
    'WUWA':                 `${API_BASE}/api/img/HEADER/Wuwa 1.jpg`,
    'PURAVEN':              `${API_BASE}/api/img/HEADER/Puraven.jpg`,
    'FINAL FANTASY':        `${API_BASE}/api/img/HEADER/FF.jpg`,
    'RESIDENT EVIL':        `${API_BASE}/api/img/HEADER/Residentevil.jpg`,
    'DEAD OR ALIVE':        `${API_BASE}/api/img/HEADER/Anime.jpg`,
    'TOKYO REVENGER':       `${API_BASE}/api/img/HEADER/TokyoR.jpg`,
    'FIRE FORCE':           `${API_BASE}/api/img/HEADER/Fireforce.jpg`,
    'ROMANCE ANIME':        `${API_BASE}/api/img/HEADER/Anime.jpg`,
    'ISEKAI':               `${API_BASE}/api/img/HEADER/Isekai.jpg`,
    'ORIGINAL':             `${API_BASE}/api/img/HEADER/Original.jpg`
};

// Custom logo dari R2
window.customLogo = {
    enabled:     true,
    url:         `${API_BASE}/api/img/HEADER/Logo.png`,
    alt:         'ZXAION VERSE Logo',
    fallbackUrl: ''
};

// ============================================================
// CUSTOM ICONS — Ganti semua FontAwesome icon dengan gambar R2
// ============================================================
window.customIcons = {
    enabled: true, // ← set true setelah upload icon ke R2

    definitions: [
        // ── Crypto donation icons ─────────────────────────────────
        { selector: '.crypto-btn[data-name="Bitcoin"] .w-12 i',   url: 'HEADER/icons/Btc.png'  },
        { selector: '.crypto-btn[data-name="Ethereum"] .w-12 i',  url: 'HEADER/icons/Ethicon.png' },
        { selector: '.crypto-btn[data-name="Solana"] .w-12 i',    url: 'HEADER/icons/Sol.png'   },
        { selector: '.crypto-btn[data-name="BNB"] .w-12 i',       url: 'HEADER/icons/Bnb icon.png'      },
        { selector: '.crypto-btn[data-name="Polygon"] .w-12 i',   url: 'HEADER/icons/Pol.webp'  },
        { selector: '.crypto-btn[data-name="XRP (BSC)"] .w-12 i', url: 'HEADER/icons/Xrpicon.png'      },
    ]
};

/** Mencegah long-press "Simpan Gambar" di mobile untuk gambar yang dilindungi. */
function preventTouchSave(e) { e.preventDefault(); }

// --- User Token ---
const getOrCreateUserToken = () => {
    let token = localStorage.getItem('zx_user_token');
    if (!token) {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        const randomHex = Array.from(array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        token = 'u_' + Date.now().toString(36) + '_' + randomHex;
        localStorage.setItem('zx_user_token', token);
    }
    return token;
};

// --- State Management ---
class AppState {
    constructor() {
        this.currentCategory    = 'All';
        this.currentAnimeAlbum  = null;
        this.currentPage        = 1;
        this.currentComitbasePage  = 1;
        this.currentDtreasurePage  = 1;
        this.allPhotos          = [];
        this.comitbasePhotos    = [];
        this.dtreasurePhotos    = [];
        this.animeAlbums        = {};
        this.filteredPhotos     = [];
        this.currentImageId     = null;
        this.credits            = 0;
        this.lifetime           = false;
        this.purchasedImages    = new Set();
        this.searchQuery        = '';
        this.selectedCreditPack = null;
    }

    resetPagination() {
        this.currentPage          = 1;
        this.currentComitbasePage = 1;
        this.currentDtreasurePage = 1;
    }
}

const state = new AppState();

// Timer untuk auto-refresh ranking carousel — dibersihkan saat ganti kategori.
let _carouselRefreshTimer = null;

// ============================================================
// ADS MODULE
// ============================================================
const ads = {
    CLIENT_ID: 'ca-pub-4913648248892788',
    SLOTS: {
        BANNER_TOP: 'SLOT_ID_BANNER_TOP',
        MODAL:      'SLOT_ID_MODAL',
        CONTENT:    'SLOT_ID_CONTENT',
        IN_FEED:    'SLOT_ID_IN_FEED',
    },
    IN_FEED_INTERVAL: 10,

    push(el) {
        if (!el || el.dataset.adsbygoogleStatus) return;
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            console.warn('[AdSense] Push error:', e.message);
        }
    },

    initStaticSlots() {
        document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])').forEach(ins => {
            this.push(ins);
        });
    },

    createInFeedAd() {
        const wrapper = document.createElement('div');
        wrapper.className = 'masonry-item ad-in-feed-item';
        wrapper.setAttribute('aria-label', 'Advertisement');
        wrapper.innerHTML = `
            <div class="relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 min-h-[200px] flex flex-col">
                <span class="absolute top-2 left-2 z-10 text-[9px] text-gray-400 bg-white/80 dark:bg-gray-900/80 px-1.5 py-0.5 rounded uppercase tracking-wider">Ad</span>
                <ins class="adsbygoogle flex-1"
                     style="display:block;min-height:200px;"
                     data-ad-client="${this.CLIENT_ID}"
                     data-ad-slot="${this.SLOTS.IN_FEED}"
                     data-ad-format="fluid"
                     data-ad-layout-key="-fb+5w+4e-db+86"></ins>
            </div>
        `;
        return wrapper;
    },

    injectInFeedAds(container) {
        if (!container || !window.adsbygoogle) return;
        const items    = container.querySelectorAll('.masonry-item:not(.ad-in-feed-item)');
        const interval = this.IN_FEED_INTERVAL;
        for (let i = interval - 1; i < items.length; i += interval) {
            const adEl = this.createInFeedAd();
            items[i].insertAdjacentElement('afterend', adEl);
        }
        container.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])').forEach(ins => {
            this.push(ins);
        });
    },

    handleCategoryChange(category) {
        const bannerTop    = document.getElementById('ad-banner-top');
        const afterGallery = document.getElementById('ad-after-gallery');
        const isPremium    = category === 'DTREASURE';
        if (bannerTop)    bannerTop.classList.toggle('hidden', isPremium);
        if (afterGallery) afterGallery.classList.toggle('hidden', isPremium);
    }
};

// --- DOM Elements ---
const elements = {
    galleryContainer:      document.getElementById('gallery-container'),
    animeCollections:      document.getElementById('anime-collections'),
    animeGrid:             document.getElementById('anime-grid'),
    comitbaseSection:      document.getElementById('comitbase-section'),
    comitbaseGallery:      document.getElementById('comitbase-gallery'),
    dtreasureSection:      document.getElementById('dtreasure-section'),
    dtreasureGallery:      document.getElementById('dtreasure-gallery'),
    paginationContainer:   document.getElementById('pagination-container'),
    comitbasePagination:   document.getElementById('comitbase-pagination'),
    dtreasurePagination:   document.getElementById('dtreasure-pagination'),
    searchInput:           document.getElementById('searchInput'),
    searchInputMobile:     document.getElementById('searchInputMobile'),
    searchClear:           document.getElementById('search-clear'),
    imageModal:            document.getElementById('image-modal'),
    modalImg:              document.getElementById('modal-img'),
    modalTitle:            document.getElementById('modal-title'),
    modalCategory:         document.getElementById('modal-category'),
    modalViewCount:        document.getElementById('modal-view-count'),
    modalDownloadCount:    document.getElementById('modal-download-count'),
    downloadBtn:           document.getElementById('download-btn'),
    originalCount:         document.getElementById('original-count'),
    creditBalance:         document.getElementById('credit-balance'),
    paypalButtonContainer: document.getElementById('paypal-button-container'),
    paypalButtons:         document.getElementById('paypal-buttons'),
};

// --- Utility Functions ---
const utils = {
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    formatNumber(num) {
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
        if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'K';
        return num.toString();
    },

    // Reusable parser untuk angka berformat K/M dari DOM.
    parseFormattedCount(text) {
        if (!text) return 0;
        const s = String(text).trim();
        if (s.endsWith('M')) return Math.round(parseFloat(s) * 1_000_000);
        if (s.endsWith('K')) return Math.round(parseFloat(s) * 1_000);
        return parseInt(s) || 0;
    }
};

// --- API Calls ---
const api = {
    imageCache: {
        main:      null,
        comitbase: null,
        dtreasure: null,
        timestamp: 0
    },

    async fetchImages() {
        try {
            const now = Date.now();
            if (this.imageCache.main && (now - this.imageCache.timestamp) < 300000) {
                state.allPhotos = this.imageCache.main;
                this.organizeAnimeAlbums();
                ui.updateOriginalAlbumCount();
                return true;
            }

            // FIX: /api/list dibatasi max 500 baris/request. Loop semua halaman
            // supaya seluruh katalog ter-load (sebelumnya gambar di luar 500
            // pertama hilang dari galeri, search, dan album anime).
            const PAGE_SIZE = 500;
            const MAX_PAGES = 50; // safety guard ~25.000 gambar
            let page    = 1;
            let allData = [];

            while (page <= MAX_PAGES) {
                const res = await fetch(`${API_BASE}/api/list?page=${page}&limit=${PAGE_SIZE}`);
                if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
                const data = await res.json();
                if (!Array.isArray(data)) break;

                allData = allData.concat(data);
                if (data.length < PAGE_SIZE) break; // halaman terakhir
                page++;
            }

            const filtered = allData.filter(photo => {
                if (!photo.path) return true;
                return !photo.path.toLowerCase().startsWith('header/');
            });

            this.imageCache.main      = filtered;
            this.imageCache.timestamp = now;

            state.allPhotos = filtered;
            this.organizeAnimeAlbums();
            ui.updateOriginalAlbumCount();
            return true;
        } catch (e) {
            console.error('Error fetching images:', e);
            ui.showEmptyState();
            return false;
        }
    },

    // Invalidate all image cache — force re-fetch on next load
    invalidateCache() {
        this.imageCache.main      = null;
        this.imageCache.comitbase = null;
        this.imageCache.dtreasure = null;
        this.imageCache.timestamp = 0;
    },

    async fetchComitbaseImages() {
        try {
            const PAGE_SIZE = 500;
            const MAX_PAGES = 50;
            let page    = 1;
            let allData = [];

            while (page <= MAX_PAGES) {
                const res = await fetch(`${API_BASE}/api/comitbase/list?page=${page}&limit=${PAGE_SIZE}`);
                if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
                const data = await res.json();
                if (!Array.isArray(data)) break;

                allData = allData.concat(data);
                if (data.length < PAGE_SIZE) break;
                page++;
            }

            state.comitbasePhotos = allData;
            return true;
        } catch (e) {
            console.error('Error fetching COMITBASE:', e);
            return false;
        }
    },

    async fetchDtreasureImages() {
        try {
            const PAGE_SIZE = 500;
            const MAX_PAGES = 50;
            let page    = 1;
            let allData = [];

            while (page <= MAX_PAGES) {
                const res = await fetch(`${API_BASE}/api/dtreasure/list?page=${page}&limit=${PAGE_SIZE}`);
                if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
                const data = await res.json();
                if (!Array.isArray(data)) break;

                allData = allData.concat(data);
                if (data.length < PAGE_SIZE) break;
                page++;
            }

            state.dtreasurePhotos = allData;
            return true;
        } catch (e) {
            console.error('Error fetching DTREASURE:', e);
            return false;
        }
    },

    async fetchImageStats(photoId) {
        if (!photoId) return { views: 0, downloads: 0 };
        try {
            const res = await fetch(`${API_BASE}/api/stats/${encodeURIComponent(photoId)}`);
            if (!res.ok) return { views: 0, downloads: 0 };
            const data = await res.json();
            return { views: data.views || 0, downloads: data.downloads || 0 };
        } catch {
            return { views: 0, downloads: 0 };
        }
    },

    async recordDownload(photoId) {
        if (!photoId) return;
        try {
            const token = getOrCreateUserToken();
            await fetch(`${API_BASE}/api/download/${encodeURIComponent(photoId)}`, {
                method:  'POST',
                headers: { 'X-User-Token': token },
            });
        } catch (error) {
            console.error('Failed to record download:', error);
        }
    },

    // FIX: Optimistic DOM update — counter di gallery grid diupdate instan
    // sebelum server response, membuat stats terasa real-time.
    async recordView(photoId) {
        if (!photoId) return;
        document.querySelectorAll(`.view-count[data-id="${photoId}"]`).forEach(el => {
            el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
        });
        try {
            const token = getOrCreateUserToken();
            await fetch(`${API_BASE}/api/view/${encodeURIComponent(photoId)}`, {
                method:  'POST',
                headers: { 'X-User-Token': token },
            });
        } catch (error) {
            console.error('Failed to record view:', error);
        }
    },

    async fetchTrendingImages(limit = 20) {
        try {
            const res  = await fetch(`${API_BASE}/api/trending?limit=${limit}`);
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error('Error fetching trending images:', e);
            // Fallback: sort dari state.allPhotos
            return state.allPhotos
                .map(p => ({ ...p, score: (p.viewCount || 0) + (p.downloadCount || 0) }))
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
        }
    },

    async fetchCreditBalance() {
        try {
            const token = getOrCreateUserToken();
            const res   = await fetch(`${API_BASE}/api/credits/balance`, {
                headers: { 'X-User-Token': token }
            });
            if (!res.ok) { console.error('fetchCreditBalance failed:', res.status); return; }
            const data = await res.json();
            state.credits        = data.credits  || 0;
            state.lifetime       = data.lifetime || false;
            state.purchasedImages = new Set(data.purchased || []);
            ui.updateCreditDisplay();
        } catch (e) {
            console.error('Failed to fetch credits:', e);
        }
    },

    async purchaseCredits(packKey, orderId) {
        const token = getOrCreateUserToken();
        try {
            const res  = await fetch(`${API_BASE}/api/credits/purchase`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
                body:    JSON.stringify({ pack: packKey, orderId })
            });
            const data = await res.json();

            if (res.ok && data.success === true) {
                return { success: true, newBalance: data.newBalance ?? 0, lifetime: data.lifetime ?? false, error: null };
            } else if (data.message === 'Order already processed') {
                return { success: true, newBalance: data.newBalance ?? 0, lifetime: data.lifetime ?? false, error: null };
            } else {
                return { success: false, error: data.error || 'Payment verification failed', orderId: data.orderId || orderId, newBalance: 0, lifetime: false };
            }
        } catch (e) {
            console.error('purchaseCredits network error:', e);
            return { success: false, error: 'Network error. Please check your connection.', newBalance: 0, lifetime: false };
        }
    },

    async spendCredit(photoId) {
        const token = getOrCreateUserToken();
        try {
            const res = await fetch(`${API_BASE}/api/credits/spend`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
                body:    JSON.stringify({ photoId })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                return { success: false, error: err.error || 'Spend credit failed' };
            }
            return res.json();
        } catch (e) {
            console.error('spendCredit network error:', e);
            return { success: false, error: 'Network error. Please check your connection.' };
        }
    },

    organizeAnimeAlbums() {
        state.animeAlbums = {};
        state.allPhotos.forEach(photo => {
            if (photo.category && photo.category.toLowerCase() === 'anime' && photo.subCategory) {
                const folderName = photo.subCategory;
                let albumTitle   = null;

                if (folderName.toLowerCase() === 'random') {
                    albumTitle = 'ORIGINAL';
                } else {
                    const normalizedName = folderName
                        .replace(/-/g, ' ')
                        .replace(/_/g, ' ')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');

                    const matchedAlbum = ANIME_SUB_ALBUMS.find(album =>
                        album.toLowerCase() === normalizedName.toLowerCase() ||
                        normalizedName.toLowerCase().includes(album.toLowerCase()) ||
                        album.toLowerCase().includes(normalizedName.toLowerCase())
                    );
                    albumTitle = matchedAlbum || normalizedName;
                }

                if (albumTitle) {
                    if (!state.animeAlbums[albumTitle]) {
                        state.animeAlbums[albumTitle] = { title: albumTitle, folderName, photos: [] };
                    }
                    state.animeAlbums[albumTitle].photos.push(photo);
                }
            }
        });

        const sorted = {};
        Object.keys(state.animeAlbums).sort().forEach(key => { sorted[key] = state.animeAlbums[key]; });
        state.animeAlbums = sorted;
    }
};

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

    // Shield: protect=true → aktifkan (belum purchase), false → nonaktifkan
    applyModalShield(protect) {
        const shield = document.getElementById('modal-img-shield');
        const img    = elements.modalImg;
        if (!shield || !img) return;

        if (protect) {
            shield.classList.remove('hidden');
            img.oncontextmenu = (e) => e.preventDefault();
            img.ondragstart   = (e) => e.preventDefault();
            img.addEventListener('touchstart', preventTouchSave, { passive: false });
        } else {
            shield.classList.add('hidden');
            img.oncontextmenu = null;
            img.ondragstart   = null;
            img.removeEventListener('touchstart', preventTouchSave);
        }
    },

    unlockDtreasureThumbnail(photoId) {
        const item = elements.dtreasureGallery?.querySelector(`.masonry-item[data-photo-id="${photoId}"]`);
        if (!item) return;

        const shield = item.querySelector('.dtreasure-thumb-shield');
        if (shield) shield.remove();

        const img = item.querySelector('img');
        if (img) {
            img.oncontextmenu = null;
            img.ondragstart   = null;
            img.removeEventListener('touchstart', preventTouchSave);
            img.style.removeProperty('-webkit-touch-callout');
        }

        const btn = item.querySelector('.download-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-download"></i> Download';
    },

    // FIX: Hapus fetchImageStats — pakai pre-loaded stats dari /api/list (zero extra API call).
    // FIX: Preload gambar via Image() — modal tampil instan, gambar load di background.
    // FIX: recordView dipanggil awal untuk optimistic DOM update.
    async openImageModal(photo) {
        if (!photo) return;

        state.currentImageId = photo.id;

        // Optimistic DOM update + fire-and-forget ke server
        api.recordView(photo.id);

        // Pakai viewCount yang sudah di-increment oleh recordView DOM update
        const displayViews     = (photo.viewCount     || 0);
        const displayDownloads = (photo.downloadCount || 0);

        const imageUrl = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;

        // Shimmer placeholder saat gambar preload
        elements.modalImg.classList.add('loading-shimmer');
        elements.modalImg.style.minHeight = '200px';
        elements.modalImg.src             = '';
        elements.modalImg.onerror         = null;
        elements.modalImg.onload          = null;

        const preload   = new Image();
        preload.onload  = () => {
            elements.modalImg.src = imageUrl;
            elements.modalImg.classList.remove('loading-shimmer');
            elements.modalImg.style.minHeight = '';
            preload.onload = null;
        };
        preload.onerror = () => {
            elements.modalImg.classList.remove('loading-shimmer');
            elements.modalImg.style.minHeight = '';
            elements.modalImg.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%231f2937" width="400" height="300"/%3E%3Ctext fill="%236b7280" font-family="sans-serif" font-size="18" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage unavailable%3C/text%3E%3C/svg%3E';
            preload.onerror = null;
        };
        preload.src = imageUrl;

        elements.modalTitle.textContent         = photo.title || 'Wallpaper';
        elements.modalCategory.textContent      = `${photo.category || photo.searchCategory || ''}${photo.subCategory ? ' / ' + photo.subCategory : ''}`;
        elements.modalViewCount.textContent     = utils.formatNumber(displayViews);
        elements.modalDownloadCount.textContent = utils.formatNumber(displayDownloads);

        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
        const isPurchased = state.lifetime || state.purchasedImages.has(photo.id);

        this.applyModalShield(isDtreasure && !isPurchased);

        if (isDtreasure) {
            if (isPurchased) {
                const token       = getOrCreateUserToken();
                const fullDlUrl   = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
                const filename    = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + '.jpg';
                const downloadUrl = `${fullDlUrl}?download=true&photoId=${encodeURIComponent(photo.id)}&userToken=${encodeURIComponent(token)}`;
                elements.downloadBtn.href = downloadUrl;
                elements.downloadBtn.setAttribute('download', filename);
                elements.downloadBtn.onclick = () => {
                    api.recordDownload(photo.id);
                    const el = elements.modalDownloadCount;
                    if (el) el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
                };
                elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
            } else {
                elements.downloadBtn.removeAttribute('href');
                elements.downloadBtn.removeAttribute('download');
                elements.downloadBtn.onclick = (e) => { e.preventDefault(); ui.handleDownload(photo); };
                elements.downloadBtn.innerHTML = '<i class="fas fa-lock mr-2"></i>10 Credits to Download';
            }
        } else {
            elements.downloadBtn.href      = imageUrl + '?download=true';
            elements.downloadBtn.download  = photo.title || 'wallpaper';
            elements.downloadBtn.onclick   = null;
            elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
        }

        // Tampilkan modal SEGERA — gambar selesai load di background
        elements.imageModal.classList.remove('hidden');
        elements.imageModal.classList.add('flex');

        const modalAdIns = document.querySelector('#ad-modal-sidebar ins:not([data-adsbygoogle-status])');
        if (modalAdIns) ads.push(modalAdIns);

        document.body.style.overflow = 'hidden';
    },

    renderGallery() {
        if (!elements.galleryContainer) return;

        // FIX: selalu sembunyikan panel "Loading/Connecting" begitu proses
        // render galeri jalan, agar tidak tampil bersamaan dengan "No Results".
        this.hideEmptyState();

        if (state.filteredPhotos.length === 0) {
            elements.galleryContainer.innerHTML = '';
            this.showNoResults();
            if (elements.paginationContainer) elements.paginationContainer.classList.add('hidden');
            return;
        }

        this.hideNoResults();

        const start        = (state.currentPage - 1) * ITEMS_PER_PAGE;
        const end          = start + ITEMS_PER_PAGE;
        const photosToShow = state.filteredPhotos.slice(start, end);

        elements.galleryContainer.innerHTML = '';

        // Disconnect observer lama — cegah memory leak
        if (this._galleryObserver) this._galleryObserver.disconnect();

        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });

        this._galleryObserver = imageObserver;

        const fragment       = document.createDocumentFragment();
        const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';

        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'masonry-item fade-in';
            item.style.animationDelay = `${index * 50}ms`;
            item.dataset.photoId = photo.id;

            const fullUrl       = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
            const viewCount     = utils.formatNumber(photo.viewCount     || 0);
            const downloadCount = utils.formatNumber(photo.downloadCount || 0);

            item.innerHTML = `
            <img
                src="${placeholderSvg}"
                data-src="${fullUrl}"
                alt="${utils.escapeHtml(photo.title) || 'Wallpaper'}"
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
            img.onload  = function() { this.classList.remove('loading-shimmer'); };
            img.onerror = function() {
                this.classList.remove('loading-shimmer');
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';
            };

            fragment.appendChild(item);
        });

        elements.galleryContainer.appendChild(fragment);
        this.setupGalleryEventListeners();
        ads.injectInFeedAds(elements.galleryContainer);

        const afterGallery = document.getElementById('ad-after-gallery');
        if (afterGallery && state.filteredPhotos.length > 0) {
            afterGallery.classList.remove('hidden');
            const ins = afterGallery.querySelector('ins:not([data-adsbygoogle-status])');
            if (ins) ads.push(ins);
        }

        this.updatePagination();
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

    async handleDownload(photo) {
        if (!photo) return;

        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';

        if (isDtreasure) {
            if (state.lifetime || state.purchasedImages.has(photo.id)) {
                this.triggerDownload(photo);
                return;
            }

            if (state.credits < 10) {
                alert('❌ Insufficient credits (Need: 10, Have: ' + state.credits + ')\n\nPlease buy more credits.');
                document.getElementById('buy-credits-btn')?.click();
                return;
            }

            const result = await api.spendCredit(photo.id);
            if (result.success) {
                state.credits = result.newBalance;
                state.purchasedImages.add(photo.id);
                ui.updateCreditDisplay();

                if (state.currentImageId === photo.id) {
                    this.applyModalShield(false);
                    const token       = getOrCreateUserToken();
                    const fullDlUrl   = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
                    const filename    = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + '.jpg';
                    const downloadUrl = `${fullDlUrl}?download=true&photoId=${encodeURIComponent(photo.id)}&userToken=${encodeURIComponent(token)}`;
                    elements.downloadBtn.href = downloadUrl;
                    elements.downloadBtn.setAttribute('download', filename);
                    elements.downloadBtn.onclick = () => { api.recordDownload(photo.id); };
                    elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
                }

                // O(1) DOM update pada item spesifik — tidak reset scroll position
                this.unlockDtreasureThumbnail(photo.id);
                this.triggerDownload(photo);
            } else {
                alert('❌ ' + (result.error || 'Download failed. Please try again.'));
            }
        } else {
            this.triggerDownload(photo);
        }
    },

    async triggerDownload(photo) {
        if (!photo || !photo.url) return;

        // FIX: pencatatan stats dipisah jadi helper, dan untuk jalur DTREASURE
        // hanya dipanggil SETELAH fetch() sukses — sebelumnya stats naik duluan
        // walau download gagal/diblokir.
        const markDownloaded = () => {
            api.recordDownload(photo.id);
            document.querySelectorAll(`.download-count[data-id="${photo.id}"]`).forEach(el => {
                el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
            });
        };

        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
        const fullUrl     = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
        const downloadUrl = `${fullUrl}?download=true&photoId=${encodeURIComponent(photo.id)}`;
        const filename    = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + '.jpg';

        if (isDtreasure) {
            const token        = getOrCreateUserToken();
            const loadingToast = document.createElement('div');
            loadingToast.id    = 'dl-toast';
            loadingToast.className = 'fixed bottom-6 right-6 z-[9999] bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2';
            loadingToast.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing download...';
            document.body.appendChild(loadingToast);

            try {
                const res = await fetch(downloadUrl, {
                    method:  'GET',
                    headers: { 'X-User-Token': token },
                });

                if (!res.ok) {
                    let errMsg = `Download failed (HTTP ${res.status})`;
                    try { const err = await res.json(); errMsg = err.error || errMsg; } catch (_) {}
                    throw new Error(errMsg);
                }

                const blob      = await res.blob();
                const objectUrl = URL.createObjectURL(blob);
                const a         = document.createElement('a');
                a.href          = objectUrl;
                a.download      = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

                markDownloaded(); // baru dicatat setelah blob berhasil didapat

                loadingToast.innerHTML = '<i class="fas fa-check-circle text-green-400"></i> Download started!';
                loadingToast.classList.add('bg-green-800');

            } catch (error) {
                console.error('DTREASURE download error:', error);
                loadingToast.innerHTML = `<i class="fas fa-times-circle text-red-400"></i> ${error.message}`;
                loadingToast.classList.add('bg-red-800');
                if (error.message.includes('403') || error.message.toLowerCase().includes('purchase required')) {
                    setTimeout(() => {
                        alert('❌ Download blocked: Purchase required.\n\nBuy credits to download DTREASURE images.');
                        document.getElementById('buy-credits-btn')?.click();
                    }, 500);
                }
            } finally {
                setTimeout(() => { document.getElementById('dl-toast')?.remove(); }, 3500);
            }
        } else {
            markDownloaded();
            const a    = document.createElement('a');
            a.href     = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { if (document.body.contains(a)) document.body.removeChild(a); }, 300);
        }
    },

    updatePagination() {
        if (!elements.paginationContainer) return;
        const totalPages = Math.ceil(state.filteredPhotos.length / ITEMS_PER_PAGE);
        if (totalPages > 1) {
            elements.paginationContainer.classList.remove('hidden');
            const pageInfo = document.getElementById('page-info');
            if (pageInfo) pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
            const prevBtn = document.getElementById('prev-page');
            const nextBtn = document.getElementById('next-page');
            if (prevBtn) prevBtn.disabled = state.currentPage === 1;
            if (nextBtn) nextBtn.disabled = state.currentPage === totalPages;
        } else {
            elements.paginationContainer.classList.add('hidden');
        }
    },

    renderAnimeCollections() {
        if (!elements.animeGrid) return;
        elements.animeGrid.innerHTML = '';
        const albumTitles = ANIME_SUB_ALBUMS.filter(title => title !== 'ORIGINAL');
        const fragment    = document.createDocumentFragment();

        albumTitles.forEach((title, index) => {
            const album = state.animeAlbums[title];
            const card  = document.createElement('div');
            card.className = 'anime-collection-card aspect-square relative cursor-pointer group fade-in';
            card.style.animationDelay = `${index * 30}ms`;

            const thumbnailSrc = window.animeAlbumThumbnails?.[title] || (album?.photos[0]?.url) || `${API_BASE}/api/img/HEADER/Anime.jpg`;
            const count        = album ? album.photos.length : 0;

            card.innerHTML = `
                <div class="w-full h-full relative overflow-hidden rounded-2xl">
                    <img src="${thumbnailSrc}" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" loading="lazy" alt="${title}">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-4">
                        <h3 class="text-white font-black text-center uppercase text-sm md:text-base leading-tight drop-shadow-lg line-clamp-2">${title}</h3>
                        <p class="text-white/70 text-center text-xs mt-1 font-semibold">${count} items</p>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => this.openAnimeAlbum(title));
            fragment.appendChild(card);
        });

        elements.animeGrid.appendChild(fragment);
    },

    openAnimeAlbum(albumTitle) {
        state.currentAnimeAlbum = albumTitle;
        const album = state.animeAlbums[albumTitle];

        if (album) {
            state.filteredPhotos = state.allPhotos.filter(photo =>
                photo.category && photo.category.toLowerCase() === 'anime' &&
                photo.subCategory &&
                photo.subCategory.toLowerCase() === album.folderName.toLowerCase()
            );
        } else {
            state.filteredPhotos = [];
        }

        if (elements.animeCollections)  elements.animeCollections.classList.add('hidden');
        if (elements.galleryContainer)  elements.galleryContainer.classList.remove('hidden');

        const heroTitle = document.getElementById('hero-title');
        const heroDesc  = document.getElementById('hero-desc');
        if (heroTitle) heroTitle.textContent = albumTitle;
        if (heroDesc)  heroDesc.textContent  = `${state.filteredPhotos.length} high quality wallpapers`;

        const actions = document.getElementById('hero-actions');
        if (actions) {
            actions.innerHTML = '';
            const backBtn = document.createElement('button');
            backBtn.className = 'border-2 border-white/50 text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-white/20 transition-all duration-300 backdrop-blur-sm';
            backBtn.innerHTML = '<i class="fas fa-arrow-left mr-2"></i> BACK TO ANIME';
            backBtn.onclick   = () => this.changeCategory('Anime');
            actions.appendChild(backBtn);
        }

        state.currentPage = 1;
        this.renderGallery();
        elements.galleryContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    renderComitbaseGallery() {
        if (!elements.comitbaseGallery) return;

        if (state.comitbasePhotos.length === 0) {
            elements.comitbaseGallery.innerHTML = `
            <div class="col-span-full text-center py-20">
                <div class="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center dark:bg-gray-700">
                    <i class="fas fa-images text-3xl text-gray-400"></i>
                </div>
                <p class="text-gray-500 dark:text-gray-400">No COMITBASE images yet</p>
            </div>`;
            if (elements.comitbasePagination) elements.comitbasePagination.classList.add('hidden');
            return;
        }

        const start        = (state.currentComitbasePage - 1) * ITEMS_PER_PAGE;
        const end          = start + ITEMS_PER_PAGE;
        const photosToShow = state.comitbasePhotos.slice(start, end);

        elements.comitbaseGallery.innerHTML = '';

        if (this._comitbaseObserver) this._comitbaseObserver.disconnect();
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '50px' });
        this._comitbaseObserver = imageObserver;

        // DocumentFragment — satu reflow saat append
        const fragment       = document.createDocumentFragment();
        const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';

        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'masonry-item fade-in';
            item.style.animationDelay = `${index * 50}ms`;
            item.dataset.photoId = photo.id;

            const fullUrl       = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
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
            img.onload  = function() { this.classList.remove('loading-shimmer'); };
            img.onerror = function() {
                this.classList.remove('loading-shimmer');
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';
            };
            fragment.appendChild(item);
        });

        elements.comitbaseGallery.appendChild(fragment);
        this.setupComitbaseEventListeners();
        this.updateComitbasePagination();
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

    updateComitbasePagination() {
        if (!elements.comitbasePagination) return;
        const totalPages = Math.ceil(state.comitbasePhotos.length / ITEMS_PER_PAGE);
        if (totalPages > 1) {
            elements.comitbasePagination.classList.remove('hidden');
            const pageInfo = document.getElementById('comitbase-page-info');
            if (pageInfo) pageInfo.textContent = `Page ${state.currentComitbasePage} of ${totalPages}`;
            const prevBtn = document.getElementById('comitbase-prev');
            const nextBtn = document.getElementById('comitbase-next');
            if (prevBtn) prevBtn.disabled = state.currentComitbasePage === 1;
            if (nextBtn) nextBtn.disabled = state.currentComitbasePage === totalPages;
        } else {
            elements.comitbasePagination.classList.add('hidden');
        }
    },

    renderDtreasureGallery() {
        if (!elements.dtreasureGallery) return;

        if (state.dtreasurePhotos.length === 0) {
            elements.dtreasureGallery.innerHTML = `
            <div class="col-span-full text-center py-20">
                <div class="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center dark:bg-gray-700">
                    <i class="fas fa-gem text-3xl text-gray-400"></i>
                </div>
                <p class="text-gray-500 dark:text-gray-400">No DTREASURE images yet</p>
            </div>`;
            this.updateDtreasurePagination();
            return;
        }

        const start        = (state.currentDtreasurePage - 1) * ITEMS_PER_PAGE;
        const end          = start + ITEMS_PER_PAGE;
        const photosToShow = state.dtreasurePhotos.slice(start, end);

        elements.dtreasureGallery.innerHTML = '';

        if (this._dtreasureObserver) this._dtreasureObserver.disconnect();
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '50px' });
        this._dtreasureObserver = imageObserver;

        // DocumentFragment — satu reflow saat append
        const fragment       = document.createDocumentFragment();
        const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';

        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'masonry-item fade-in';
            item.style.animationDelay = `${index * 50}ms`;
            item.dataset.photoId = photo.id;

            const fullUrl       = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
            const isFree        = state.lifetime || state.purchasedImages.has(photo.id);
            const buttonText    = isFree ? 'Download' : '10 Credits';
            const buttonIcon    = isFree ? 'fa-download' : 'fa-lock';
            const viewCount     = utils.formatNumber(photo.viewCount     || 0);
            const downloadCount = utils.formatNumber(photo.downloadCount || 0);

            const thumbShield = isFree ? '' : `
    <div
        class="dtreasure-thumb-shield absolute inset-0 z-[1]"
        oncontextmenu="return false;"
        ondragstart="return false;"
        style="-webkit-tap-highlight-color:transparent; cursor:pointer;">
    </div>`;

            item.innerHTML = `
<div class="relative" style="line-height:0;">
    <img
        src="${placeholderSvg}"
        data-src="${fullUrl}"
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
        <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${photo.id}">${viewCount}</span></span>
        <span><i class="fas fa-download"></i> <span class="download-count" data-id="${photo.id}">${downloadCount}</span></span>
    </div>
    <button class="download-btn" type="button">
        <i class="fas ${buttonIcon}"></i> ${buttonText}
    </button>
</div>`;

            const img   = item.querySelector('img');
            imageObserver.observe(img);
            img.onload  = function() { this.classList.remove('loading-shimmer'); };
            img.onerror = function() {
                this.classList.remove('loading-shimmer');
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';
            };
            fragment.appendChild(item);
        });

        elements.dtreasureGallery.appendChild(fragment);
        this.setupDtreasureEventListeners();
        this.updateDtreasurePagination();
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

    updateDtreasurePagination() {
        if (!elements.dtreasurePagination) return;
        const totalPages = Math.ceil(state.dtreasurePhotos.length / ITEMS_PER_PAGE);
        if (totalPages <= 1) {
            elements.dtreasurePagination.classList.add('hidden');
            return;
        }
        elements.dtreasurePagination.classList.remove('hidden');
        const pageInfo = document.getElementById('dtreasure-page-info');
        if (pageInfo) pageInfo.textContent = `Page ${state.currentDtreasurePage} of ${totalPages}`;
        const prevBtn = document.getElementById('dtreasure-prev');
        const nextBtn = document.getElementById('dtreasure-next');
        if (prevBtn) prevBtn.disabled = state.currentDtreasurePage === 1;
        if (nextBtn) nextBtn.disabled = state.currentDtreasurePage >= totalPages;
    },

    changeCategory(category) {
        if (!category) return;

        state.currentCategory   = category;
        state.currentAnimeAlbum = null;
        state.resetPagination();
        state.searchQuery = '';

        ads.handleCategoryChange(category);

        if (elements.searchInput)       elements.searchInput.value = '';
        if (elements.searchInputMobile) elements.searchInputMobile.value = '';
        if (elements.searchClear)       elements.searchClear.classList.add('hidden');

        document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
        const activeId  = category === 'All' ? 'cat-all' : `cat-${category.toLowerCase()}`;
        const activeBtn = document.getElementById(activeId);
        if (activeBtn) activeBtn.classList.add('active');

        if (elements.animeCollections)    elements.animeCollections.classList.add('hidden');
        if (elements.comitbaseSection)    elements.comitbaseSection.classList.add('hidden');
        if (elements.dtreasureSection)    elements.dtreasureSection.classList.add('hidden');
        if (elements.galleryContainer)    elements.galleryContainer.classList.add('hidden');
        if (elements.paginationContainer) elements.paginationContainer.classList.add('hidden');

        // Ranking carousel hanya di Home
        const rankingSection = document.getElementById('ranking-carousel-section');
        if (rankingSection) rankingSection.classList.toggle('hidden', category !== 'All');

        // Bersihkan timer auto-refresh saat ganti kategori
        if (_carouselRefreshTimer) {
            clearInterval(_carouselRefreshTimer);
            _carouselRefreshTimer = null;
        }

        if (category === 'All') {
            if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
            state.filteredPhotos = utils.shuffleArray(
                state.allPhotos.filter(p => p.category && p.category.toLowerCase() === 'anime')
            );
            this.renderGallery();

            // Render carousel, lalu auto-refresh setiap 2 menit
            this.renderTopRankingCarousel().catch(e => console.error('renderTopRankingCarousel error:', e));
            _carouselRefreshTimer = setInterval(() => {
                if (state.currentCategory === 'All') {
                    ui.renderTopRankingCarousel().catch(() => {});
                } else {
                    clearInterval(_carouselRefreshTimer);
                    _carouselRefreshTimer = null;
                }
            }, 120_000);

        } else if (category === 'Anime') {
            if (elements.animeCollections) elements.animeCollections.classList.remove('hidden');
            this.renderAnimeCollections();

        } else if (category === 'COMITBASE') {
            if (elements.comitbaseSection) elements.comitbaseSection.classList.remove('hidden');
            this.renderComitbaseGallery();

        } else if (category === 'DTREASURE') {
            if (elements.dtreasureSection) elements.dtreasureSection.classList.remove('hidden');
            this.renderDtreasureGallery();

        } else {
            if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
            state.filteredPhotos = state.allPhotos.filter(photo =>
                photo.category && photo.category.toLowerCase() === category.toLowerCase()
            );
            this.renderGallery();
        }

        this.updateHeroSection(category);
        document.getElementById('page-hero')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    updateHeroSection(category) {
        const pageDetails = {
            'All':         { title: 'ZXAION VERSE',          desc: 'Multi high quality wallpaper make your device more perfect' },
            'Anime':       { title: 'ANIME HIGH QUALITY',    desc: 'Pick your best waifu to your beloved device uwu' },
            'Abstract':    { title: 'Abstract & Texture',    desc: 'Exploration of shapes and colors.' },
            'Photography': { title: 'Photography Lens',      desc: 'Real moments in high resolution.' },
            'Fantasy':     { title: 'Fantasy & Myth',        desc: 'Dragons, magic, and medieval worlds.' },
            'COMITBASE':   { title: 'WORLDWIDE COLLECTION',  desc: 'Share your visual composition all around the world' },
            'DTREASURE':   { title: 'DTREASURE VAULT',       desc: 'Exclusive content, commercial use, best value' },
            'ZMEME':       { title: 'ZMEME',                 desc: 'Memes and fun images' },
            'OVERLAY':     { title: 'OVERLAY',               desc: 'Overlay graphics and templates' }
        };

        const detail    = pageDetails[category] || pageDetails['All'];
        const heroTitle = document.getElementById('hero-title');
        const heroDesc  = document.getElementById('hero-desc');
        if (heroTitle) heroTitle.textContent = detail.title;
        if (heroDesc)  heroDesc.textContent  = detail.desc;

        const hero = document.getElementById('page-hero');
        if (hero && window.headerBackgrounds?.[category]) {
            hero.style.backgroundImage = `url('${window.headerBackgrounds[category]}')`;
        }

        const actions = document.getElementById('hero-actions');
        if (actions) actions.innerHTML = '';
    },

    // FIX: Satu shared IntersectionObserver untuk semua kartu — O(1) vs O(N)
    async renderTopRankingCarousel() {
        const carousel = document.getElementById('ranking-carousel');
        if (!carousel) return;

        carousel.innerHTML = Array.from({ length: 6 }, () =>
            '<div class="flex-none rounded-2xl overflow-hidden bg-gray-800 ranking-card-skeleton" style="min-width:144px;width:144px;aspect-ratio:9/16;"></div>'
        ).join('');

        const photos = await api.fetchTrendingImages(20);

        if (!photos || photos.length === 0) {
            carousel.innerHTML =
                '<div class="flex items-center justify-center w-full py-6">' +
                '<p class="text-gray-500 text-sm">No trending data yet — start exploring!</p>' +
                '</div>';
            return;
        }

        carousel.innerHTML = '';
        const fragment = document.createDocumentFragment();

        // Satu shared observer untuk semua kartu — cegah N observer instances
        const sharedObserver = 'IntersectionObserver' in window
            ? new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src         = img.dataset.src;
                            delete img.dataset.src;
                            img.onerror = () => { img.style.opacity = '0.2'; };
                        }
                        observer.unobserve(img);
                    }
                });
            }, { root: carousel, rootMargin: '200px' })
            : null;

        photos.forEach((photo, index) => {
            const fullUrl    = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
            const rankColors = ['from-amber-400 to-yellow-500', 'from-gray-300 to-gray-400', 'from-amber-700 to-amber-800'];
            const rankColor  = index < 3 ? rankColors[index] : 'from-gray-700 to-gray-800';
            const rankLabel  = index < 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][index] : `#${index + 1}`;
            const isMedal    = index < 3;
            const score      = (photo.viewCount || 0) + (photo.downloadCount || 0);
            const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='256'%3E%3Crect fill='%23222' width='144' height='256'/%3E%3C/svg%3E";

            const card = document.createElement('div');
            card.className = 'ranking-card flex-none cursor-pointer group relative rounded-2xl overflow-hidden shadow-lg ring-1 ring-white/10 bg-gray-900';
            card.style.cssText = 'min-width:144px;width:144px;';

            card.innerHTML =
                '<div class="relative w-full" style="aspect-ratio:9/16;">' +
                    '<img src="' + placeholder + '" data-src="' + fullUrl + '" alt="' + utils.escapeHtml(photo.title) + '" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300 ranking-lazy-img" loading="lazy" decoding="async" draggable="false">' +
                    '<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent pointer-events-none"></div>' +
                    '<div class="absolute top-2 left-2 bg-gradient-to-br ' + rankColor + ' rounded-full w-8 h-8 flex items-center justify-center shadow-lg ' + (isMedal ? 'text-base' : 'text-white text-xs font-black') + '">' + rankLabel + '</div>' +
                    '<div class="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-1">' +
                        '<i class="fas fa-fire text-amber-400" style="font-size:8px;"></i>' +
                        '<span class="text-white text-[10px] font-bold">' + utils.formatNumber(score) + '</span>' +
                    '</div>' +
                    '<div class="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">' +
                        '<p class="text-white text-[11px] font-bold leading-tight" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + utils.escapeHtml(photo.title || 'Wallpaper') + '</p>' +
                        '<div class="flex items-center gap-2 mt-1.5">' +
                            '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-eye text-green-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.viewCount || 0) + '</span>' +
                            '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-download text-blue-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.downloadCount || 0) + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            const img = card.querySelector('img.ranking-lazy-img');
            if (img) {
                if (sharedObserver) sharedObserver.observe(img);
                else if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
            }

            card.addEventListener('click', () => ui.openImageModal(photo));
            fragment.appendChild(card);
        });

        carousel.appendChild(fragment);
    },

    handleSearch(query) {
        const searchTerm = (query || '').toLowerCase().trim();
        state.searchQuery = searchTerm;

        if (searchTerm.length > 0) {
            if (elements.searchClear) elements.searchClear.classList.remove('hidden');

            if (elements.animeCollections) elements.animeCollections.classList.add('hidden');
            if (elements.comitbaseSection) elements.comitbaseSection.classList.add('hidden');
            if (elements.dtreasureSection) elements.dtreasureSection.classList.add('hidden');
            if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');

            const mainMatches = state.allPhotos.filter(photo =>
                (photo.title        && photo.title.toLowerCase().includes(searchTerm)) ||
                (photo.category     && photo.category.toLowerCase().includes(searchTerm)) ||
                (photo.subCategory  && photo.subCategory.toLowerCase().includes(searchTerm)) ||
                (photo.path         && photo.path.toLowerCase().includes(searchTerm))
            );

            const taggedComitbase = state.comitbasePhotos
                .filter(p => (p.title && p.title.toLowerCase().includes(searchTerm)) || (p.uploader && p.uploader.toLowerCase().includes(searchTerm)))
                .map(p => ({ ...p, searchCategory: 'COMITBASE' }));

            const taggedDtreasure = state.dtreasurePhotos
                .filter(p => p.title && p.title.toLowerCase().includes(searchTerm))
                .map(p => ({ ...p, searchCategory: 'DTREASURE' }));

            state.filteredPhotos = [...mainMatches, ...taggedComitbase, ...taggedDtreasure];
            state.currentPage    = 1;
            this.renderGallery();

            const heroTitle = document.getElementById('hero-title');
            const heroDesc  = document.getElementById('hero-desc');
            if (heroTitle) heroTitle.textContent = `Search: "${query}"`;
            if (heroDesc)  heroDesc.textContent  = `${state.filteredPhotos.length} results found`;
        } else {
            if (elements.searchClear) elements.searchClear.classList.add('hidden');
            state.currentAnimeAlbum = null;
            this.changeCategory(state.currentCategory);
        }
    },

    updateCreditDisplay() {
        if (elements.creditBalance) {
            elements.creditBalance.textContent = state.lifetime ? '∞' : utils.formatNumber(state.credits);
        }
    },

    async loadQuicklinks() {
        const list = document.getElementById('quicklinks-list');
        if (!list) return;
        try {
            const res = await fetch('/quicklink.json');
            if (!res.ok) throw new Error(`Failed to load quicklinks: HTTP ${res.status}`);
            const data = await res.json();
            list.innerHTML = '';

            Object.keys(data).forEach(key => {
                const btn = document.createElement('button');
                btn.type  = 'button';
                btn.className = 'w-full text-left bg-gray-50 hover:bg-gray-100 p-4 rounded-xl transition-all duration-300 flex items-center justify-between group dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white';
                btn.innerHTML = `
                    <span class="font-semibold">${utils.escapeHtml(data[key].title)}</span>
                    <i class="fas fa-chevron-right text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-300 dark:group-hover:text-gray-300"></i>
                `;
                btn.addEventListener('click', () => {
                    const titleEl    = document.getElementById('quicklink-title');
                    const contentEl  = document.getElementById('quicklink-content');
                    const modalEl    = document.getElementById('quicklink-content-modal');
                    const menuModalEl = document.getElementById('menu-modal');

                    if (titleEl)   titleEl.textContent = data[key].title;
                    if (contentEl) {
                        // Sanitasi dasar: hapus script, inline handlers, javascript: URI
                        const sanitized = (data[key].content || '')
                            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
                            .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
                            .replace(/javascript\s*:/gi, '');
                        contentEl.innerHTML = sanitized;
                    }
                    if (modalEl)    { modalEl.classList.remove('hidden');    modalEl.classList.add('flex'); }
                    if (menuModalEl) { menuModalEl.classList.add('hidden'); menuModalEl.classList.remove('flex'); }
                });
                list.appendChild(btn);
            });
        } catch (e) {
            console.error('Failed to load quicklinks:', e);
            list.innerHTML = '<p class="text-center text-gray-500 py-4 dark:text-gray-400">Failed to load links</p>';
        }
    },

    initLogo() {
        if (!window.customLogo?.enabled || !window.customLogo?.url) return;

        const setupLogoImage = (imgEl, textEl, url, alt) => {
            if (!imgEl) return;
            imgEl.onerror = function() {
                this.onerror = null;
                this.classList.add('hidden');
                if (textEl) textEl.classList.remove('hidden');
                console.warn('Logo image failed to load, using text fallback');
            };
            imgEl.onload = function() {
                this.onload = null;
                if (textEl) textEl.classList.add('hidden');
            };
            imgEl.src = url;
            imgEl.alt = alt || 'Logo';
            imgEl.classList.remove('hidden');
        };

        setupLogoImage(document.getElementById('logo-image'),        document.getElementById('logo-text'),        window.customLogo.url, window.customLogo.alt);
        setupLogoImage(document.getElementById('footer-logo-image'), document.getElementById('footer-logo-text'), window.customLogo.url, window.customLogo.alt);
    },

    // Mengganti FontAwesome <i> tags dengan <img> dari R2.
    // Fallback otomatis ke FontAwesome jika gambar gagal load.
    initIcons() {
        if (!window.customIcons?.enabled || !Array.isArray(window.customIcons?.definitions)) return;

        window.customIcons.definitions.forEach(({ selector, url }) => {
            if (!selector || !url) return;
            try {
                document.querySelectorAll(selector).forEach(iconEl => {
                    const img         = document.createElement('img');
                    img.src           = `${API_BASE}/api/img/${url}`;
                    img.alt           = '';
                    img.width         = 20;
                    img.height        = 20;
                    img.style.cssText = 'object-fit:contain;display:inline-block;vertical-align:middle;pointer-events:none;';

                    img.onerror = () => { img.remove(); iconEl.style.display = ''; };
                    img.onload  = () => { iconEl.style.display = 'none'; };

                    iconEl.parentNode.insertBefore(img, iconEl);
                });
            } catch (e) {
                console.warn('[initIcons] Selector error:', selector, e.message);
            }
        });
    },

    renderCreditPacks() {
        const packsDiv = document.getElementById('credit-packs');
        if (!packsDiv) return;
        packsDiv.innerHTML = '';

        Object.entries(CREDIT_PACKS).forEach(([key, pack]) => {
            const isLifetime = pack.credits === 'lifetime';
            const btn        = document.createElement('button');
            btn.type         = 'button';
            btn.className    = `credit-pack-card w-full bg-gradient-to-r ${pack.color} p-0.5 rounded-2xl transition-all duration-300`;
            btn.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-[14px] p-4 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gradient-to-br ${pack.color} rounded-xl flex items-center justify-center shadow-lg">
                            <i class="fas fa-${isLifetime ? 'crown' : 'coins'} text-white text-xl"></i>
                        </div>
                        <div class="text-left">
                            <div class="font-bold text-gray-900 dark:text-white text-lg">${pack.label}</div>
                            <div class="text-sm text-gray-500 dark:text-gray-400">
                                ${isLifetime ? 'Lifetime Access' : `${pack.credits.toLocaleString()} credits`}
                                ${pack.bonus ? `<span class="text-green-500 font-semibold ml-1">+${pack.bonus} bonus</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-black text-2xl text-gray-900 dark:text-white">$${pack.price}</div>
                        <div class="text-xs text-gray-400">${isLifetime ? 'One-time' : 'USD'}</div>
                    </div>
                </div>
            `;

            btn.addEventListener('click', () => {
                document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
                btn.classList.add('selected');
                state.selectedCreditPack = { key, ...pack };
                initPayPalPurchase(key, pack.price);
            });

            packsDiv.appendChild(btn);
        });
    }
};

// ============================================================
// Dynamic sticky top — kalkulasi otomatis berdasarkan tinggi
// nav + mobile search agar category-nav tidak overlap elemen lain.
// ============================================================
function updateCategoryNavTop() {
    const nav          = document.querySelector('nav');
    const mobileSearch = document.getElementById('mobile-search-bar');
    const catNav       = document.getElementById('category-nav');
    if (!catNav || !nav) return;

    const navHeight    = nav.getBoundingClientRect().height;
    const isMobile     = window.innerWidth < 768;
    const searchHeight = (isMobile && mobileSearch)
        ? mobileSearch.getBoundingClientRect().height
        : 0;

    catNav.style.top = `${Math.ceil(navHeight + searchHeight)}px`;
}

// --- Event Handlers ---
function initEvents() {
    // Home link
    document.getElementById('home-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        ui.changeCategory('All');
    });

    // Category buttons
    const categoryMap = {
        'cat-all':         'All',
        'cat-anime':       'Anime',
        'cat-fantasy':     'Fantasy',
        'cat-abstract':    'Abstract',
        'cat-photography': 'Photography',
        'cat-comitbase':   'COMITBASE',
        'cat-dtreasure':   'DTREASURE',
        'cat-zmeme':       'ZMEME',
        'cat-overlay':     'OVERLAY'
    };

    Object.entries(categoryMap).forEach(([id, category]) => {
        document.getElementById(id)?.addEventListener('click', () => ui.changeCategory(category));
    });

    // Search — separate debounce instances per input (cegah timer conflict)
    const debouncedSearchDesktop = utils.debounce((e) => {
        const query = e.target.value.trim();
        if (elements.searchInputMobile) elements.searchInputMobile.value = e.target.value;
        if (query.length > 0 || state.searchQuery !== '') ui.handleSearch(query);
    }, 300);

    const debouncedSearchMobile = utils.debounce((e) => {
        const query = e.target.value.trim();
        if (elements.searchInput) elements.searchInput.value = e.target.value;
        if (query.length > 0 || state.searchQuery !== '') ui.handleSearch(query);
    }, 300);

    if (elements.searchInput)       elements.searchInput.addEventListener('input', debouncedSearchDesktop);
    if (elements.searchInputMobile) elements.searchInputMobile.addEventListener('input', debouncedSearchMobile);

    elements.searchClear?.addEventListener('click', () => {
        if (elements.searchInput)       elements.searchInput.value = '';
        if (elements.searchInputMobile) elements.searchInputMobile.value = '';
        elements.searchClear.classList.add('hidden');
        ui.changeCategory(state.currentCategory);
    });

    // Donation modal
    const donationModal = document.getElementById('donation-modal');
    document.getElementById('donation-btn')?.addEventListener('click', () => {
        donationModal?.classList.remove('hidden');
        donationModal?.classList.add('flex');
    });
    document.getElementById('close-donation')?.addEventListener('click', () => {
        donationModal?.classList.add('hidden');
        donationModal?.classList.remove('flex');
    });

    // Crypto buttons
    document.querySelectorAll('.crypto-btn, .crypto-btn-usdt').forEach(btn => {
        btn.addEventListener('click', function() {
            const address     = this.dataset.address;
            const name        = this.dataset.name;
            const cryptoModal = document.getElementById('crypto-modal');
            const iconMap     = {
                'Bitcoin':  'fab fa-bitcoin text-3xl text-orange-500',
                'Ethereum': 'fab fa-ethereum text-3xl text-blue-500',
                'Solana':   'fas fa-sun text-3xl text-purple-500',
                'BNB':      'fas fa-bolt text-3xl text-yellow-500',
                'Polygon':  'fas fa-hexagon text-3xl text-indigo-500',
                'XRP':      'fas fa-chart-line text-3xl text-cyan-500',
            };
            const iconClass = Object.keys(iconMap).find(k => name?.includes(k));

            const cryptoTypeEl    = document.getElementById('crypto-type');
            const cryptoAddressEl = document.getElementById('crypto-address');
            const cryptoIconEl    = document.getElementById('crypto-icon');

            if (cryptoTypeEl)    cryptoTypeEl.textContent  = name;
            if (cryptoAddressEl) cryptoAddressEl.textContent = address;
            if (cryptoIconEl)    cryptoIconEl.className    = iconClass ? iconMap[iconClass] : 'fas fa-coins text-3xl text-gray-600 dark:text-gray-400';

            if (cryptoModal) { cryptoModal.classList.remove('hidden'); cryptoModal.classList.add('flex'); }
        });
    });

    // Copy crypto address
    document.getElementById('copy-crypto-address')?.addEventListener('click', function() {
        const address = document.getElementById('crypto-address')?.textContent;
        if (!address) return;
        navigator.clipboard.writeText(address).then(() => {
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
            this.classList.add('bg-green-600');
            setTimeout(() => { this.innerHTML = originalText; this.classList.remove('bg-green-600'); }, 2000);
        }).catch(() => alert('Failed to copy address'));
    });

    // Close crypto modal
    const cryptoModal = document.getElementById('crypto-modal');
    document.getElementById('close-crypto-modal')?.addEventListener('click', () => {
        cryptoModal?.classList.add('hidden'); cryptoModal?.classList.remove('flex');
    });

    // ZVERSE modal
    const zverseModal = document.getElementById('zverse-modal');
    document.getElementById('zverse-btn')?.addEventListener('click', () => { zverseModal?.classList.remove('hidden'); zverseModal?.classList.add('flex'); });
    document.getElementById('close-zverse')?.addEventListener('click', () => { zverseModal?.classList.add('hidden'); zverseModal?.classList.remove('flex'); });

    // MENU modal
    const menuModal = document.getElementById('menu-modal');
    document.getElementById('menu-btn')?.addEventListener('click', () => {
        ui.loadQuicklinks();
        menuModal?.classList.remove('hidden'); menuModal?.classList.add('flex');
    });
    document.getElementById('close-menu')?.addEventListener('click', () => { menuModal?.classList.add('hidden'); menuModal?.classList.remove('flex'); });

    // Quicklink content modal
    const quicklinkContentModal = document.getElementById('quicklink-content-modal');
    document.getElementById('close-quicklink-content')?.addEventListener('click', () => {
        quicklinkContentModal?.classList.add('hidden'); quicklinkContentModal?.classList.remove('flex');
    });

    // Image modal close
    document.getElementById('close-image-modal')?.addEventListener('click', () => {
        elements.imageModal?.classList.add('hidden');
        elements.imageModal?.classList.remove('flex');
        document.body.style.overflow = '';
    });

    elements.imageModal?.addEventListener('click', (e) => {
        if (e.target === elements.imageModal) {
            elements.imageModal.classList.add('hidden');
            elements.imageModal.classList.remove('flex');
            document.body.style.overflow = '';
        }
    });

    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (state.currentPage > 1) { state.currentPage--; ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
        const total = Math.ceil(state.filteredPhotos.length / ITEMS_PER_PAGE);
        if (state.currentPage < total) { state.currentPage++; ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // COMITBASE pagination
    document.getElementById('comitbase-prev')?.addEventListener('click', () => {
        if (state.currentComitbasePage > 1) { state.currentComitbasePage--; ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('comitbase-next')?.addEventListener('click', () => {
        const total = Math.ceil(state.comitbasePhotos.length / ITEMS_PER_PAGE);
        if (state.currentComitbasePage < total) { state.currentComitbasePage++; ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // DTREASURE pagination
    document.getElementById('dtreasure-prev')?.addEventListener('click', () => {
        if (state.currentDtreasurePage > 1) { state.currentDtreasurePage--; ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('dtreasure-next')?.addEventListener('click', () => {
        const total = Math.ceil(state.dtreasurePhotos.length / ITEMS_PER_PAGE);
        if (state.currentDtreasurePage < total) { state.currentDtreasurePage++; ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // COMIT HERE
    document.getElementById('comit-here-btn')?.addEventListener('click', () => {
        const subject = 'COMITBASE Submission - Visual Composition';
        const body    = `Title:\nArtist Name:\nPlatform Name:\nArt Desc (optional):\nVisual Link: (Google Drive only)\n\n---\nSubmitted via ZXAION VERSE COMITBASE`;
        window.open(`mailto:zxaionxl@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    });

    // Buy Credits modal
    const buyCreditsModal = document.getElementById('buy-credits-modal');

    document.getElementById('buy-credits-btn')?.addEventListener('click', () => {
        ui.renderCreditPacks();
        buyCreditsModal?.classList.remove('hidden');
        buyCreditsModal?.classList.add('flex');
    });

    const closeBuyCredits = document.getElementById('close-buy-credits');
    if (closeBuyCredits && buyCreditsModal) {
        closeBuyCredits.addEventListener('click', () => {
            if (typeof paypalButtonsInstance !== 'undefined' && paypalButtonsInstance) {
                try { paypalButtonsInstance.close(); } catch (e) { console.warn('PayPal close error:', e); }
                paypalButtonsInstance = null;
            }
            buyCreditsModal.classList.add('hidden');
            buyCreditsModal.classList.remove('flex');
            document.body.style.overflow = '';
            if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
            if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
            document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
            state.selectedCreditPack = null;
        });
    }

    // Dark mode toggle
    document.getElementById('darkmode-toggle')?.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
    });
    if (localStorage.getItem('darkMode') === 'true') document.documentElement.classList.add('dark');

    // Keyboard shortcuts — ESC closes all modals
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modals = [
            elements.imageModal,
            document.getElementById('donation-modal'),
            document.getElementById('zverse-modal'),
            document.getElementById('menu-modal'),
            document.getElementById('quicklink-content-modal'),
            document.getElementById('buy-credits-modal'),
            document.getElementById('crypto-modal')
        ];

        let anyOpen = false;
        modals.forEach(modal => {
            if (!modal || modal.classList.contains('hidden')) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            anyOpen = true;

            if (modal.id === 'buy-credits-modal') {
                if (typeof paypalButtonsInstance !== 'undefined' && paypalButtonsInstance) {
                    try { paypalButtonsInstance.close(); } catch (_) {}
                    paypalButtonsInstance = null;
                }
                if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
                if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
                document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
                state.selectedCreditPack = null;
            }
        });
        if (anyOpen) document.body.style.overflow = '';
    });

    // Backdrop click closes modal
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.classList.add('hidden');
                backdrop.classList.remove('flex');
                document.body.style.overflow = '';
            }
        });
    });
}

// --- PayPal Integration ---
let paypalButtonsInstance = null;

// Guard: jika SDK belum load (defer script), retry hingga 3x
function initPayPalPurchase(packKey, price) {
    if (!window.paypal) {
        let retries = 0;
        const waitForSdk = setInterval(() => {
            retries++;
            if (window.paypal) {
                clearInterval(waitForSdk);
                _renderPayPalButtons(packKey, price);
            } else if (retries >= 3) {
                clearInterval(waitForSdk);
                alert('❌ PayPal SDK failed to load. Please check your internet connection and refresh the page.');
            }
        }, 800);
        return;
    }
    _renderPayPalButtons(packKey, price);
}

function _renderPayPalButtons(packKey, price) {
    if (paypalButtonsInstance) {
        try { paypalButtonsInstance.close(); } catch (e) { console.warn('Error closing previous PayPal instance:', e); }
        paypalButtonsInstance = null;
    }

    if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.remove('hidden');
    if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';

    try {
        paypalButtonsInstance = paypal.Buttons({
            style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'paypal' },

            createOrder: (data, actions) => {
                const token = getOrCreateUserToken();
                return actions.order.create({
                    purchase_units: [{
                        description: `ZXAION Credits: ${packKey}`,
                        custom_id:   token,
                        amount:      { currency_code: 'USD', value: price.toString() }
                    }]
                });
            },

            onApprove: async (data, actions) => {
                let capturedOrderId = null;
                try {
                    const order     = await actions.order.capture();
                    capturedOrderId = order.id;

                    let result      = null;
                    let retryCount  = 0;
                    const maxRetries = 3;

                    while (retryCount < maxRetries) {
                        try {
                            result = await api.purchaseCredits(packKey, capturedOrderId);
                            if (result.success) break;
                            retryCount++;
                            if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 2000 * retryCount));
                        } catch (e) {
                            retryCount++;
                            console.error(`Attempt ${retryCount} network error:`, e);
                            if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 2000 * retryCount));
                        }
                    }

                    if (result && result.success) {
                        state.credits  = result.newBalance;
                        state.lifetime = result.lifetime || false;
                        ui.updateCreditDisplay();
                        await api.fetchCreditBalance();
                        api.invalidateCache();

                        alert(state.lifetime
                            ? '✅ Lifetime Access Activated!\n\nEnjoy unlimited downloads on DTREASURE collection.'
                            : `✅ Purchase Successful!\n\nYou now have ${result.newBalance} credits.`
                        );

                        const buyCreditsModal = document.getElementById('buy-credits-modal');
                        if (buyCreditsModal) { buyCreditsModal.classList.add('hidden'); buyCreditsModal.classList.remove('flex'); }
                        document.body.style.overflow = '';
                        if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
                        if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
                        paypalButtonsInstance = null;

                        if (state.currentCategory === 'DTREASURE') ui.renderDtreasureGallery();

                    } else {
                        const errMsg  = result?.error || 'Credits could not be applied automatically';
                        const orderId = result?.orderId || capturedOrderId;
                        alert(
                            `⚠️ Payment Received But Auto-Credit Failed\n\n` +
                            `Order ID: ${orderId}\n\n` +
                            `Email zxaionxl@gmail.com with Order ID above.\n` +
                            `Credits will be added within 24 hours.`
                        );
                    }
                } catch (error) {
                    console.error('PayPal onApprove error:', error);
                    alert(`❌ Payment Processing Error${capturedOrderId ? '\n\nOrder ID: ' + capturedOrderId : ''}\n\n${error.message || 'An unexpected error occurred.'}`);
                }
            },

            onError:  (err) => { console.error('PayPal error:', err); alert('❌ PayPal error. Please try again.'); },
            onCancel: ()    => { console.log('User cancelled payment'); }
        });

        if (elements.paypalButtons) {
            paypalButtonsInstance.render('#paypal-buttons').catch(error => {
                console.error('PayPal render error:', error);
                alert('❌ Failed to load PayPal. Please refresh the page.');
                paypalButtonsInstance = null;
            });
        }
    } catch (error) {
        console.error('Error initializing PayPal:', error);
        alert('❌ Failed to initialize PayPal. Please try again.');
        paypalButtonsInstance = null;
    }
}

// --- Global Functions ---
window.refreshImages = async () => {
    ui.hideEmptyState();
    const success = await api.fetchImages();
    if (success) ui.changeCategory(state.currentCategory);
};

window.changeCategory    = (category)    => ui.changeCategory(category);
window.openAnimeCollection = (albumTitle) => ui.openAnimeAlbum(albumTitle);

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    ui.initLogo();
    ui.initIcons();
    initEvents();

    // Dynamic sticky top — kalkulasi saat load dan saat resize
    updateCategoryNavTop();
    const _resizeObserver = new ResizeObserver(() => updateCategoryNavTop());
    const _navEl          = document.querySelector('nav');
    const _searchEl       = document.getElementById('mobile-search-bar');
    if (_navEl)    _resizeObserver.observe(_navEl);
    if (_searchEl) _resizeObserver.observe(_searchEl);

    // Fetch semua data paralel — maksimalkan performa awal
    await Promise.all([
        api.fetchCreditBalance(),
        api.fetchImages(),
        api.fetchComitbaseImages(),
        api.fetchDtreasureImages(),
    ]);

    ui.changeCategory('All');
    ads.initStaticSlots();

    // Sticky nav shadow on scroll
    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        nav?.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });

    // Carousel scroll buttons
    const rankingCarousel = document.getElementById('ranking-carousel');
    document.getElementById('carousel-scroll-left')?.addEventListener('click', () => {
        rankingCarousel?.scrollBy({ left: -420, behavior: 'smooth' });
    });
    document.getElementById('carousel-scroll-right')?.addEventListener('click', () => {
        rankingCarousel?.scrollBy({ left: 420, behavior: 'smooth' });
    });

    // Mouse drag-to-scroll untuk carousel desktop
    if (rankingCarousel) {
        let isDragging   = false;
        let startX       = 0;
        let scrollLeftAt = 0;

        rankingCarousel.addEventListener('mousedown', (e) => {
            isDragging   = true;
            startX       = e.pageX - rankingCarousel.offsetLeft;
            scrollLeftAt = rankingCarousel.scrollLeft;
            rankingCarousel.style.userSelect = 'none';
        });

        const stopDrag = () => { isDragging = false; rankingCarousel.style.removeProperty('user-select'); };
        rankingCarousel.addEventListener('mouseleave', stopDrag);
        rankingCarousel.addEventListener('mouseup',    stopDrag);
        rankingCarousel.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            rankingCarousel.scrollLeft = scrollLeftAt - ((e.pageX - rankingCarousel.offsetLeft) - startX) * 1.5;
        });
    }
});
