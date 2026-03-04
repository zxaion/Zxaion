

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
    '5$':   { credits: 200,  bonus: 0,    label: 'BASIC', price: 5, color: 'from-gray-400 to-gray-500' },
    '25$':  { credits: 1300, bonus: 450,  label: 'STANDARD', price: 25, color: 'from-blue-400 to-blue-500' },
    '45$':  { credits: 2700, bonus: 900,  label: 'PREMIUM', price: 45, color: 'from-violet-400 to-violet-500' },
    '75$':  { credits: 4500, bonus: 1400, label: 'ULTIMATE', price: 75, color: 'from-purple-400 to-purple-500' },
    '99$':  { credits: 7000, bonus: 2300, label: 'MEGA', price: 99, color: 'from-pink-400 to-rose-500' },
    '125$': { credits: 'lifetime', bonus: 0, label: 'LIFETIME PRO', price: 125, color: 'from-amber-400 to-orange-500' }
};

// --- User Token ---
const getOrCreateUserToken = () => {
    let token = localStorage.getItem('zx_user_token');
    if (!token) {
        token = 'u_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('zx_user_token', token);
    }
    return token;
};

// --- State Management ---
class AppState {
    constructor() {
        this.currentCategory = 'All';
        this.currentAnimeAlbum = null;
        this.currentPage = 1;
        this.currentComitbasePage = 1;
        this.currentDtreasurePage = 1;
        this.allPhotos = [];
        this.comitbasePhotos = [];
        this.dtreasurePhotos = [];
        this.animeAlbums = {};
        this.filteredPhotos = [];
        this.currentImageId = null;
        this.credits = 0;
        this.lifetime = false;
        this.purchasedImages = new Set();
        this.searchQuery = '';
        this.selectedCreditPack = null;
    }

    resetPagination() {
        this.currentPage = 1;
        this.currentComitbasePage = 1;
        this.currentDtreasurePage = 1;
    }
}

const state = new AppState();

// --- DOM Elements ---
const elements = {
    galleryContainer: document.getElementById('gallery-container'),
    animeCollections: document.getElementById('anime-collections'),
    animeGrid: document.getElementById('anime-grid'),
    comitbaseSection: document.getElementById('comitbase-section'),
    comitbaseGallery: document.getElementById('comitbase-gallery'),
    dtreasureSection: document.getElementById('dtreasure-section'),
    dtreasureGallery: document.getElementById('dtreasure-gallery'),
    paginationContainer: document.getElementById('pagination-container'),
    comitbasePagination: document.getElementById('comitbase-pagination'),
    dtreasurePagination: document.getElementById('dtreasure-pagination'),
    searchInput: document.getElementById('searchInput'),
    searchInputMobile: document.getElementById('searchInputMobile'),
    searchClear: document.getElementById('search-clear'),
    imageModal: document.getElementById('image-modal'),
    modalImg: document.getElementById('modal-img'),
    modalTitle: document.getElementById('modal-title'),
    modalCategory: document.getElementById('modal-category'),
    modalViewCount: document.getElementById('modal-view-count'),
    modalDownloadCount: document.getElementById('modal-download-count'),
    downloadBtn: document.getElementById('download-btn'),
    originalCount: document.getElementById('original-count'),
    creditBalance: document.getElementById('credit-balance'),
    paypalButtonContainer: document.getElementById('paypal-button-container'),
    paypalButtons: document.getElementById('paypal-buttons'),
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
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    getImagePreviewUrl(url) {
    if (!url) return '';
    return url;
},

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }
};

// --- API Calls ---
const api = {
    imageCache: {
        main: null,
        comitbase: null,
        dtreasure: null,
        timestamp: 0
    },
    
    async fetchImages() {
        try {
            // ✅ Cache 5 menit
            const now = Date.now();
            if (this.imageCache.main && (now - this.imageCache.timestamp) < 300000) {
                state.allPhotos = this.imageCache.main;
                this.organizeAnimeAlbums();
                ui.updateOriginalAlbumCount();
                return true;
            }
            
            const res = await fetch(`${API_BASE}/api/list`);
            const data = await res.json();
            if (Array.isArray(data)) {
                this.imageCache.main = data;
                this.imageCache.timestamp = now;
                
                state.allPhotos = data.filter(photo => {
                    if (!photo.path) return true;
                    return !photo.path.toLowerCase().startsWith('header/');
                });
                this.organizeAnimeAlbums();
                ui.updateOriginalAlbumCount();
                return true;
            }
            return false;
        } catch (e) {
            console.error('Error fetching images:', e);
            ui.showEmptyState();
            return false;
        }
    },
    
    // Tambahkan di dalam object api, setelah method fetchImages():

// ✅ NEW METHOD: Invalidate cache
invalidateCache() {
    this.imageCache.main = null;
    this.imageCache.comitbase = null;
    this.imageCache.dtreasure = null;
    this.imageCache.timestamp = 0;
},
    async fetchComitbaseImages() {
        try {
            const res = await fetch(`${API_BASE}/api/comitbase/list`);
            const data = await res.json();
            if (Array.isArray(data)) {
                state.comitbasePhotos = data;
                return true;
            }
            return false;
        } catch (e) {
            console.error('Error fetching COMITBASE:', e);
            return false;
        }
    },

    async fetchDtreasureImages() {
        try {
            const res = await fetch(`${API_BASE}/api/dtreasure/list`);
            const data = await res.json();
            if (Array.isArray(data)) {
                state.dtreasurePhotos = data;
                return true;
            }
            return false;
        } catch (e) {
            console.error('Error fetching DTREASURE:', e);
            return false;
        }
    },

    async fetchImageStats(photoId) {
        if (!photoId) return { views: 0, downloads: 0 };
        try {
            const res = await fetch(`${API_BASE}/api/stats/${encodeURIComponent(photoId)}`);
            const data = await res.json();
            return { views: data.views || 0, downloads: data.downloads || 0 };
        } catch (error) {
            return { views: 0, downloads: 0 };
        }
    },

    async recordDownload(photoId) {
        if (!photoId) return;
        try {
            await fetch(`${API_BASE}/api/download/${encodeURIComponent(photoId)}`, { method: 'POST' });
        } catch (error) {
            console.error('Failed to record download:', error);
        }
    },

    async recordView(photoId) {
        if (!photoId) return;
        try {
            await fetch(`${API_BASE}/api/view/${encodeURIComponent(photoId)}`, { method: 'POST' });
        } catch (error) {
            console.error('Failed to record view:', error);
        }
    },

    async fetchCreditBalance() {
        try {
            const token = getOrCreateUserToken();
            const res = await fetch(`${API_BASE}/api/credits/balance`, {
                headers: { 'X-User-Token': token }
            });
            const data = await res.json();
            state.credits = data.credits || 0;
            state.lifetime = data.lifetime || false;
            state.purchasedImages = new Set(data.purchased || []);
            ui.updateCreditDisplay();
        } catch (e) {
            console.error('Failed to fetch credits:', e);
        }
    },

    // ✅ PERBAIKAN - Replace function `purchaseCredits` di object `api`

    async purchaseCredits(packKey, orderId) {
    const token = getOrCreateUserToken();
    try {
        const res = await fetch(`${API_BASE}/api/credits/purchase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Token': token
            },
            body: JSON.stringify({ pack: packKey, orderId })
        });
        
        const data = await res.json();
        
        // ✅ PERBAIKAN: Handle semua response cases dengan proper
        if (res.ok && data.success === true) {
          return {
            success: true,
            newBalance: data.newBalance ?? 0,
            lifetime: data.lifetime ?? false,
            error: null,
          };
        } else if (data.message === 'Order already processed') {
          // Order sudah diproses sebelumnya, ini OK
          return {
            success: true,
            newBalance: data.newBalance ?? 0,
            lifetime: data.lifetime ?? false,
            error: null,
          };
        } else {
          // Error dari server
          return {
            success: false,
            error: data.error || 'Payment verification failed',
            orderId: data.orderId || orderId,
            newBalance: 0,
            lifetime: false
          };
        }
    } catch (e) {
        console.error('purchaseCredits network error:', e);
        return { 
          success: false, 
          error: 'Network error. Please check your connection.',
          newBalance: 0, 
          lifetime: false 
        };
    }
},
    async spendCredit(photoId) {
    const token = getOrCreateUserToken();
    try {
        const res = await fetch(`${API_BASE}/api/credits/spend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Token': token },
            body: JSON.stringify({ photoId })
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
                let albumTitle = null;
                
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
                        state.animeAlbums[albumTitle] = {
                            title: albumTitle,
                            folderName: folderName,
                            photos: []
                        };
                    }
                    state.animeAlbums[albumTitle].photos.push(photo);
                }
            }
        });
        
        // Sort alphabetically
        const sorted = {};
        Object.keys(state.animeAlbums).sort().forEach(key => {
            sorted[key] = state.animeAlbums[key];
        });
        state.animeAlbums = sorted;
    }
};

// --- UI Functions ---
const ui = {
    updateOriginalAlbumCount() {
        const originalAlbum = state.animeAlbums['ORIGINAL'];
        const count = originalAlbum ? originalAlbum.photos.length : 0;
        if (elements.originalCount) {
            elements.originalCount.textContent = count.toLocaleString();
        }
    },

    showEmptyState() {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.classList.remove('hidden');
    },

    hideEmptyState() {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.classList.add('hidden');
    },

    showNoResults() {
        const noResults = document.getElementById('no-results');
        if (noResults) noResults.classList.remove('hidden');
    },

    hideNoResults() {
        const noResults = document.getElementById('no-results');
        if (noResults) noResults.classList.add('hidden');
    },

    // Di bagian ui.openImageModal()
async openImageModal(photo) {
    if (!photo) return;

    state.currentImageId = photo.id;
    api.recordView(photo.id);

    const stats = await api.fetchImageStats(photo.id);

    const imageUrl = photo.url.startsWith('http')
        ? photo.url
        : `${API_BASE}${photo.url}`;

    elements.modalImg.src = imageUrl;
    elements.modalTitle.textContent = photo.title || 'Wallpaper';
    elements.modalCategory.textContent = `${photo.category || photo.searchCategory || ''}${photo.subCategory ? ' / ' + photo.subCategory : ''}`;
    elements.modalViewCount.textContent = utils.formatNumber(stats.views);
    elements.modalDownloadCount.textContent = utils.formatNumber(stats.downloads);

    const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';

    if (isDtreasure) {
        // ✅ DTREASURE: Replace <a> with a <button> so credit check runs via handleDownload
        // Never expose the raw download URL as an href
        elements.downloadBtn.removeAttribute('href');
        elements.downloadBtn.removeAttribute('download');
        elements.downloadBtn.onclick = (e) => {
            e.preventDefault();
            ui.handleDownload(photo);
        };

        const isFree = state.lifetime || state.purchasedImages.has(photo.id);
        elements.downloadBtn.innerHTML = isFree
            ? '<i class="fas fa-download mr-2"></i>Download'
            : '<i class="fas fa-lock mr-2"></i>10 Credits to Download';
    } else {
        // FREE: Bersihkan semua state DTREASURE sebelumnya, lalu set download langsung
        elements.downloadBtn.setAttribute('href', imageUrl + '?download=true');
        elements.downloadBtn.setAttribute('download', (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + '.jpg');
        elements.downloadBtn.onclick = null;
        elements.downloadBtn.removeAttribute('data-photo-id');
        elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
    }

    elements.imageModal.classList.remove('hidden');
    elements.imageModal.classList.add('flex');
    document.body.style.overflow = 'hidden';
},

    renderGallery() {
        if (!elements.galleryContainer) return;
        
        if (state.filteredPhotos.length === 0) {
            elements.galleryContainer.innerHTML = '';
            this.showNoResults();
            if (elements.paginationContainer) {
                elements.paginationContainer.classList.add('hidden');
            }
            return;
        }
        
        this.hideNoResults();
        
        const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const photosToShow = state.filteredPhotos.slice(start, end);
        
        elements.galleryContainer.innerHTML = '';
        
        // ✅ Intersection Observer untuk lazy loading
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        delete img.dataset.src;
                    }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '50px' });
        
        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = "masonry-item fade-in";
            item.style.animationDelay = `${index * 50}ms`;
            item.dataset.photoId = photo.id; // ✅ Store ID, not URL
            
            const fullUrl = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
            const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';
            
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
                    <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${photo.id}">0</span></span>
                    <span><i class="fas fa-download"></i> <span class="download-count" data-id="${photo.id}">0</span></span>
                </div>
                <button class="download-btn" type="button">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        `;
            
            const img = item.querySelector('img');
            imageObserver.observe(img);
            
            img.onload = function() {
                this.classList.remove('loading-shimmer');
                ui.loadStatsForItem(photo.id, item);
            };
            
            img.onerror = function() {
                this.classList.remove('loading-shimmer');
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Error%3C/text%3E%3C/svg%3E';
            };
            
            elements.galleryContainer.appendChild(item);
        });
        
        // ✅ Event delegation - single listener untuk semua items
        this.setupGalleryEventListeners();
        this.updatePagination();
    },
    
    // ✅ NEW METHOD: Setup gallery event listeners dengan delegation
    setupGalleryEventListeners() {
        // Remove old listener jika ada
        if (this.galleryClickHandler) {
            elements.galleryContainer.removeEventListener('click', this.galleryClickHandler);
        }
        
        const handleGalleryClick = (e) => {
            // Handle download button
            const downloadBtn = e.target.closest('.download-btn');
            if (downloadBtn) {
                e.stopPropagation();
                const item = downloadBtn.closest('.masonry-item');
                const photoId = item.dataset.photoId;
                const photo = state.filteredPhotos.find(p => p.id === photoId);
                if (photo) {
                    ui.handleDownload(photo);
                }
                return;
            }
            
            // Handle image click
            const item = e.target.closest('.masonry-item');
            if (item && !e.target.closest('.download-btn')) {
                const photoId = item.dataset.photoId;
                const photo = state.filteredPhotos.find(p => p.id === photoId);
                if (photo) {
                    ui.openImageModal(photo);
                }
            }
        };
        
        this.galleryClickHandler = handleGalleryClick;
        elements.galleryContainer.addEventListener('click', handleGalleryClick);
    },

    async loadStatsForItem(photoId, item) {
    try {
        const stats = await api.fetchImageStats(photoId);
        const viewSpan = item.querySelector('.view-count');
        const downloadSpan = item.querySelector('.download-count');
        if (viewSpan) viewSpan.textContent = utils.formatNumber(stats.views);
        if (downloadSpan) downloadSpan.textContent = utils.formatNumber(stats.downloads);
    } catch (error) {
        console.warn('Failed to load stats for photo:', photoId, error);
        // Set default values on error
        const viewSpan = item.querySelector('.view-count');
        const downloadSpan = item.querySelector('.download-count');
        if (viewSpan) viewSpan.textContent = '0';
        if (downloadSpan) downloadSpan.textContent = '0';
    }
},

    async handleDownload(photo) {
    if (!photo) return;
    
    // ✅ Strict check untuk DTREASURE category
    const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
    
    if (isDtreasure) {
        // Check if lifetime
        if (state.lifetime) {
            this.triggerDownload(photo);
            return;
        }
        
        // Check if already purchased
        if (state.purchasedImages.has(photo.id)) {
            this.triggerDownload(photo);
            return;
        }
        
        // ✅ Check credits - MUST have exactly 10
        if (state.credits < 10) {
            alert('❌ Insufficient credits (Need: 10, Have: ' + state.credits + ')\n\nPlease buy more credits.');
            document.getElementById('buy-credits-btn')?.click();
            return;
        }
        
        // Spend credit
        const result = await api.spendCredit(photo.id);
        if (result.success) {
            state.credits = result.newBalance;
            state.purchasedImages.add(photo.id);
            ui.updateCreditDisplay();
            this.triggerDownload(photo);
            
            // ✅ Refresh gallery untuk update button
            ui.renderDtreasureGallery();
        } else {
            alert('❌ ' + (result.error || 'Download failed. Please try again.'));
        }
    } else {
        // Free download untuk kategori lain
        this.triggerDownload(photo);
    }
},

    async triggerDownload(photo) {
    if (!photo || !photo.url) return;

    api.recordDownload(photo.id);

    // ✅ FIX: Optimistic counter — parse format K/M dengan benar
    const parseFormattedCount = (text) => {
        if (!text) return 0;
        const str = text.trim();
        if (str.endsWith('M')) return Math.round(parseFloat(str) * 1_000_000);
        if (str.endsWith('K')) return Math.round(parseFloat(str) * 1_000);
        return parseInt(str) || 0;
    };

    const downloadCounts = document.querySelectorAll(`.download-count[data-id="${photo.id}"]`);
    downloadCounts.forEach(el => {
        const count = parseFormattedCount(el.textContent);
        el.textContent = utils.formatNumber(count + 1);
    });

    const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
    const fullUrl = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
    const downloadUrl = `${fullUrl}?download=true&photoId=${encodeURIComponent(photo.id)}`;
    const filename = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_') + '.jpg';

    if (isDtreasure) {
        const token = getOrCreateUserToken();

        const loadingToast = document.createElement('div');
        loadingToast.id = 'dl-toast';
        loadingToast.className = 'fixed bottom-6 right-6 z-[9999] bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2';
        loadingToast.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing download...';
        document.body.appendChild(loadingToast);

        try {
            const res = await fetch(downloadUrl, {
                method: 'GET',
                headers: { 'X-User-Token': token },
            });

            if (!res.ok) {
                let errMsg = `Download failed (HTTP ${res.status})`;
                try { const err = await res.json(); errMsg = err.error || errMsg; } catch (_) {}
                throw new Error(errMsg);
            }

            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

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
            setTimeout(() => {
                const toast = document.getElementById('dl-toast');
                if (toast) toast.remove();
            }, 3500);
        }
    } else {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
    }
},

    updatePagination() {
        if (!elements.paginationContainer) return;
        
        const totalPages = Math.ceil(state.filteredPhotos.length / ITEMS_PER_PAGE);
        
        if (totalPages > 1) {
            elements.paginationContainer.classList.remove('hidden');
            const pageInfo = document.getElementById('page-info');
            if (pageInfo) {
                pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
            }
            
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
        
        albumTitles.forEach((title, index) => {
            const album = state.animeAlbums[title];
            const card = document.createElement('div');
            card.className = "anime-collection-card aspect-square relative cursor-pointer group fade-in";
            card.style.animationDelay = `${index * 30}ms`;
            
            const thumbnailSrc = window.animeAlbumThumbnails?.[title] || (album?.photos[0]?.url) || 'https://ai.zxaionverse.workers.dev/api/img/HEADER/Anime.jpg';
            const count = album ? album.photos.length : 0;
            
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
            elements.animeGrid.appendChild(card);
        });
    },

    openAnimeAlbum(albumTitle) {
    state.currentAnimeAlbum = albumTitle;
    const album = state.animeAlbums[albumTitle];
    
    if (album) {
        // ✅ Case-insensitive filter
        state.filteredPhotos = state.allPhotos.filter(photo =>
            photo.category && photo.category.toLowerCase() === 'anime' &&
            photo.subCategory &&
            photo.subCategory.toLowerCase() === album.folderName.toLowerCase()
        );
    } else {
        state.filteredPhotos = [];
    }
    
    if (elements.animeCollections) {
        elements.animeCollections.classList.add('hidden');
    }
    if (elements.galleryContainer) {
        elements.galleryContainer.classList.remove('hidden');
    }
    
    const heroTitle = document.getElementById('hero-title');
    const heroDesc = document.getElementById('hero-desc');
    
    if (heroTitle) heroTitle.textContent = albumTitle;
    if (heroDesc) heroDesc.textContent = `${state.filteredPhotos.length} high quality wallpapers`;
    
    const actions = document.getElementById('hero-actions');
    if (actions) {
        actions.innerHTML = '';
        const backBtn = document.createElement('button');
        backBtn.className = "border-2 border-white/50 text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-white/20 transition-all duration-300 backdrop-blur-sm";
        backBtn.innerHTML = '<i class="fas fa-arrow-left mr-2"></i> BACK TO ANIME';
        backBtn.onclick = () => this.changeCategory('Anime');
        actions.appendChild(backBtn);
    }
    
    // ✅ Reset to page 1
    state.currentPage = 1;
    this.renderGallery();
    
    // Scroll to gallery
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
            </div>
        `;
            if (elements.comitbasePagination) {
                elements.comitbasePagination.classList.add('hidden');
            }
            return;
        }
        
        const start = (state.currentComitbasePage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const photosToShow = state.comitbasePhotos.slice(start, end);
        
        elements.comitbaseGallery.innerHTML = '';

// ✅ Satu observer untuk semua gambar (mencegah memory leak)
const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
                img.src = img.dataset.src;
                delete img.dataset.src;
            }
            observer.unobserve(img);
        }
    });
}, { rootMargin: '50px' });

photosToShow.forEach((photo, index) => {
    const item = document.createElement('div');
    item.className = "masonry-item fade-in";
    item.style.animationDelay = `${index * 50}ms`;
    item.dataset.photoId = photo.id;
    
    const fullUrl = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
    const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';
    
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
                    <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${photo.id}">0</span></span>
                    <span><i class="fas fa-download"></i> <span class="download-count" data-id="${photo.id}">0</span></span>
                </div>
                <button class="download-btn" type="button">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        `;
    
    const img = item.querySelector('img');
    imageObserver.observe(img); // ✅ Pakai observer yang sama
    
    img.onload = function() {
        this.classList.remove('loading-shimmer');
        ui.loadStatsForItem(photo.id, item);
    };
    
    img.onerror = function() {
        this.classList.remove('loading-shimmer');
        this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Error%3C/text%3E%3C/svg%3E';
    };
    
    elements.comitbaseGallery.appendChild(item);
});
        
        // ✅ Event delegation
        this.setupComitbaseEventListeners();
        this.updateComitbasePagination();
    },
    
    // ✅ NEW METHOD: Setup comitbase event listeners
    setupComitbaseEventListeners() {
        if (this.comitbaseClickHandler) {
            elements.comitbaseGallery.removeEventListener('click', this.comitbaseClickHandler);
        }
        
        const handleClick = (e) => {
            const downloadBtn = e.target.closest('.download-btn');
            if (downloadBtn) {
                e.stopPropagation();
                const item = downloadBtn.closest('.masonry-item');
                const photoId = item.dataset.photoId;
                const photo = state.comitbasePhotos.find(p => p.id === photoId);
                if (photo) ui.handleDownload(photo);
                return;
            }
            
            const item = e.target.closest('.masonry-item');
            if (item && !e.target.closest('.download-btn')) {
                const photoId = item.dataset.photoId;
                const photo = state.comitbasePhotos.find(p => p.id === photoId);
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
            if (pageInfo) {
                pageInfo.textContent = `Page ${state.currentComitbasePage} of ${totalPages}`;
            }
            
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
            </div>
        `;
            this.updateDtreasurePagination();
            return;
        }
        
        const start = (state.currentDtreasurePage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const photosToShow = state.dtreasurePhotos.slice(start, end);
        
        elements.dtreasureGallery.innerHTML = '';
        
        
        // ✅ Satu observer untuk semua gambar (mencegah memory leak)
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        delete img.dataset.src;
                    }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '50px' });
        
        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = "masonry-item fade-in";
            item.style.animationDelay = `${index * 50}ms`;
            item.dataset.photoId = photo.id;
            
            const fullUrl = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
            const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';
            
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
                    <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${photo.id}">0</span></span>
                    <span><i class="fas fa-download"></i> <span class="download-count" data-id="${photo.id}">0</span></span>
                </div>
                <button class="download-btn" type="button">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        `;
            
            const img = item.querySelector('img');
            imageObserver.observe(img); // ✅ Pakai observer yang sama
            
            img.onload = function() {
                this.classList.remove('loading-shimmer');
                ui.loadStatsForItem(photo.id, item);
            };
            
            img.onerror = function() {
                this.classList.remove('loading-shimmer');
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Error%3C/text%3E%3C/svg%3E';
            };
            
            elements.comitbaseGallery.appendChild(item);
        });
        
        // ✅ Event delegation
        this.setupDtreasureEventListeners();
        this.updateDtreasurePagination();
    },
    
    // ✅ NEW METHOD: Setup dtreasure event listeners
    setupDtreasureEventListeners() {
        if (this.dtreasureClickHandler) {
            elements.dtreasureGallery.removeEventListener('click', this.dtreasureClickHandler);
        }
        
        const handleClick = (e) => {
            const downloadBtn = e.target.closest('.download-btn');
            if (downloadBtn) {
                e.stopPropagation();
                const item = downloadBtn.closest('.masonry-item');
                const photoId = item.dataset.photoId;
                const photo = state.dtreasurePhotos.find(p => p.id === photoId);
                if (photo) ui.handleDownload(photo);
                return;
            }
            
            const item = e.target.closest('.masonry-item');
            if (item && !e.target.closest('.download-btn')) {
                const photoId = item.dataset.photoId;
                const photo = state.dtreasurePhotos.find(p => p.id === photoId);
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
    if (pageInfo) {
        pageInfo.textContent = `Page ${state.currentDtreasurePage} of ${totalPages}`;
    }
    
    const prevBtn = document.getElementById('dtreasure-prev');
    const nextBtn = document.getElementById('dtreasure-next');
    
    if (prevBtn) prevBtn.disabled = state.currentDtreasurePage === 1;
    if (nextBtn) nextBtn.disabled = state.currentDtreasurePage === totalPages;
},

    changeCategory(category) {
        if (!category) return;
        
        state.currentCategory = category;
        state.currentAnimeAlbum = null;
        state.resetPagination();
        state.searchQuery = '';
        
        // Clear search inputs
        if (elements.searchInput) elements.searchInput.value = '';
        if (elements.searchInputMobile) elements.searchInputMobile.value = '';
        if (elements.searchClear) elements.searchClear.classList.add('hidden');
        
        // Update active category button
        document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
        const activeId = category === 'All' ? 'cat-all' : `cat-${category.toLowerCase()}`;
        const activeBtn = document.getElementById(activeId);
        if (activeBtn) activeBtn.classList.add('active');
        
        // Hide all sections
        if (elements.animeCollections) elements.animeCollections.classList.add('hidden');
        if (elements.comitbaseSection) elements.comitbaseSection.classList.add('hidden');
        if (elements.dtreasureSection) elements.dtreasureSection.classList.add('hidden');
        if (elements.galleryContainer) elements.galleryContainer.classList.add('hidden');
        if (elements.paginationContainer) elements.paginationContainer.classList.add('hidden');
        
        // Show appropriate section
        if (category === 'All') {
            if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
            state.filteredPhotos = utils.shuffleArray([...state.allPhotos]);
            this.renderGallery();
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
        
        // Scroll to top of content
        const hero = document.getElementById('page-hero');
        if (hero) {
            hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    updateHeroSection(category) {
        const pageDetails = {
            'All': { title: "ZXAION VERSE", desc: "Multi high quality wallpaper make your device more perfect" },
            'Anime': { title: "ANIME HIGH QUALITY", desc: "Pick your best waifu to your beloved device uwu" },
            'Abstract': { title: "Abstract & Texture", desc: "Exploration of shapes and colors." },
            'Photography': { title: "Photography Lens", desc: "Real moments in high resolution." },
            'Fantasy': { title: "Fantasy & Myth", desc: "Dragons, magic, and medieval worlds." },
            'COMITBASE': { title: "WORLDWIDE COLLECTION", desc: "Share your visual composition all around the world" },
            'DTREASURE': { title: "DTREASURE VAULT", desc: "Exclusive content, commercial use, best value" },
            'ZMEME': { title: "ZMEME", desc: "Memes and fun images" },
            'OVERLAY': { title: "OVERLAY", desc: "Overlay graphics and templates" }
        };
        
        const detail = pageDetails[category] || pageDetails['All'];
        const heroTitle = document.getElementById('hero-title');
        const heroDesc = document.getElementById('hero-desc');
        
        if (heroTitle) heroTitle.textContent = detail.title;
        if (heroDesc) heroDesc.textContent = detail.desc;
        
        const hero = document.getElementById('page-hero');
        if (hero && window.headerBackgrounds && window.headerBackgrounds[category]) {
            hero.style.backgroundImage = `url('${window.headerBackgrounds[category]}')`;
        }
        
        const actions = document.getElementById('hero-actions');
        if (actions) actions.innerHTML = '';
    },

    handleSearch(query) {
    const searchTerm = (query || '').toLowerCase().trim();
    state.searchQuery = searchTerm;
    
    if (searchTerm.length > 0) {
        // Show clear button
        if (elements.searchClear) elements.searchClear.classList.remove('hidden');
        
        // Hide all category sections
        if (elements.animeCollections) elements.animeCollections.classList.add('hidden');
        if (elements.comitbaseSection) elements.comitbaseSection.classList.add('hidden');
        if (elements.dtreasureSection) elements.dtreasureSection.classList.add('hidden');
        if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
        
        // Search across all photos
        state.filteredPhotos = state.allPhotos.filter(photo => {
            const titleMatch = photo.title && photo.title.toLowerCase().includes(searchTerm);
            const categoryMatch = photo.category && photo.category.toLowerCase().includes(searchTerm);
            const subCategoryMatch = photo.subCategory && photo.subCategory.toLowerCase().includes(searchTerm);
            const pathMatch = photo.path && photo.path.toLowerCase().includes(searchTerm);
            return titleMatch || categoryMatch || subCategoryMatch || pathMatch;
        });
        
        // Also search in COMITBASE and DTREASURE
        const comitbaseMatches = state.comitbasePhotos.filter(photo => {
            const titleMatch = photo.title && photo.title.toLowerCase().includes(searchTerm);
            const uploaderMatch = photo.uploader && photo.uploader.toLowerCase().includes(searchTerm);
            return titleMatch || uploaderMatch;
        });
        
        const dtreasureMatches = state.dtreasurePhotos.filter(photo => {
            const titleMatch = photo.title && photo.title.toLowerCase().includes(searchTerm);
            return titleMatch;
        });
        
        // Combine results with category tags
        const taggedComitbase = comitbaseMatches.map(p => ({...p, searchCategory: 'COMITBASE'}));
        const taggedDtreasure = dtreasureMatches.map(p => ({...p, searchCategory: 'DTREASURE'}));
        
        state.filteredPhotos = [...state.filteredPhotos, ...taggedComitbase, ...taggedDtreasure];
        
        // ✅ CRITICAL: Reset to page 1
        state.currentPage = 1;
        this.renderGallery();
        
        const heroTitle = document.getElementById('hero-title');
        const heroDesc = document.getElementById('hero-desc');
        
        if (heroTitle) heroTitle.textContent = `Search: "${query}"`;
        if (heroDesc) heroDesc.textContent = `${state.filteredPhotos.length} results found`;
    } else {
        // Clear search
        if (elements.searchClear) elements.searchClear.classList.add('hidden');
        // ✅ Reset anime album juga
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
        try {
            const res = await fetch('/quicklink.json');
            const data = await res.json();
            const list = document.getElementById('quicklinks-list');
            
            if (!list) return;
            
            list.innerHTML = '';
            
            Object.keys(data).forEach(key => {
                const btn = document.createElement('button');
                btn.className = 'w-full text-left bg-gray-50 hover:bg-gray-100 p-4 rounded-xl transition-all duration-300 flex items-center justify-between group dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white';
                btn.innerHTML = `
                    <span class="font-semibold">${utils.escapeHtml(data[key].title)}</span>
                    <i class="fas fa-chevron-right text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-300 dark:group-hover:text-gray-300"></i>
                `;
                btn.addEventListener('click', () => {
                    const titleEl = document.getElementById('quicklink-title');
                    const contentEl = document.getElementById('quicklink-content');
                    const modalEl = document.getElementById('quicklink-content-modal');
                    const menuModalEl = document.getElementById('menu-modal');
                    
                    if (titleEl) titleEl.textContent = data[key].title;
                    if (contentEl) contentEl.innerHTML = data[key].content;
                    if (modalEl) {
                        modalEl.classList.remove('hidden');
                        modalEl.classList.add('flex');
                    }
                    if (menuModalEl) menuModalEl.classList.add('hidden');
                });
                list.appendChild(btn);
            });
        } catch (e) {
            console.error('Failed to load quicklinks:', e);
            const list = document.getElementById('quicklinks-list');
            if (list) {
                list.innerHTML = '<p class="text-center text-gray-500 py-4">Failed to load links</p>';
            }
        }
    },

    initLogo() {
        // Check for custom logo configuration
        if (window.customLogo && window.customLogo.enabled && window.customLogo.url) {
            const logoText = document.getElementById('logo-text');
            const logoImage = document.getElementById('logo-image');
            const footerLogoText = document.getElementById('footer-logo-text');
            const footerLogoImage = document.getElementById('footer-logo-image');
            
            if (logoText) logoText.classList.add('hidden');
            if (logoImage) {
                logoImage.src = window.customLogo.url;
                logoImage.alt = window.customLogo.alt || 'Logo';
                logoImage.classList.remove('hidden');
            }
            
            if (footerLogoText) footerLogoText.classList.add('hidden');
            if (footerLogoImage) {
                footerLogoImage.src = window.customLogo.url;
                footerLogoImage.alt = window.customLogo.alt || 'Logo';
                footerLogoImage.classList.remove('hidden');
            }
        }
    },

    renderCreditPacks() {
        const packsDiv = document.getElementById('credit-packs');
        if (!packsDiv) return;
        
        packsDiv.innerHTML = '';
        
        Object.entries(CREDIT_PACKS).forEach(([key, pack]) => {
            const isLifetime = pack.credits === 'lifetime';
            const totalCredits = isLifetime ? '∞' : (pack.credits + (pack.bonus || 0)).toLocaleString();
            
            const btn = document.createElement('button');
            btn.className = `credit-pack-card w-full bg-gradient-to-r ${pack.color} p-0.5 rounded-2xl transition-all duration-300`;
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
                // Remove selected class from all packs
                document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
                btn.classList.add('selected');
                
                state.selectedCreditPack = { key, ...pack };
                initPayPalPurchase(key, pack.price);
            });
            
            packsDiv.appendChild(btn);
        });
    }
};

// --- Event Handlers ---
function initEvents() {
    // Home link
    const homeLink = document.getElementById('home-link');
    if (homeLink) {
        homeLink.addEventListener('click', (e) => {
            e.preventDefault();
            ui.changeCategory('All');
        });
    }

    // Category buttons
    const categoryMap = {
        'cat-all': 'All',
        'cat-anime': 'Anime',
        'cat-fantasy': 'Fantasy',
        'cat-abstract': 'Abstract',
        'cat-photography': 'Photography',
        'cat-comitbase': 'COMITBASE',
        'cat-dtreasure': 'DTREASURE',
        'cat-zmeme': 'ZMEME',
        'cat-overlay': 'OVERLAY'
    };

    Object.entries(categoryMap).forEach(([id, category]) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => ui.changeCategory(category));
        }
    });

// ✅ OPTIMIZATION: Improve debounce dengan timeout lebih pendek
const debouncedSearch = utils.debounce((e) => {
    const query = e.target.value.trim();
    if (query.length > 0 || state.searchQuery !== '') {
        ui.handleSearch(query);
    }
}, 300); // ✅ Sudah optimal
    
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debouncedSearch);
    }
    
    if (elements.searchInputMobile) {
        elements.searchInputMobile.addEventListener('input', debouncedSearch);
    }

    // Search clear button
    if (elements.searchClear) {
        elements.searchClear.addEventListener('click', () => {
            if (elements.searchInput) elements.searchInput.value = '';
            if (elements.searchInputMobile) elements.searchInputMobile.value = '';
            elements.searchClear.classList.add('hidden');
            ui.changeCategory(state.currentCategory);
        });
    }

    // Donation modal
    const donationBtn = document.getElementById('donation-btn');
    const donationModal = document.getElementById('donation-modal');
    const closeDonation = document.getElementById('close-donation');
    
    if (donationBtn && donationModal) {
        donationBtn.addEventListener('click', () => {
            donationModal.classList.remove('hidden');
            donationModal.classList.add('flex');
        });
    }
    
    if (closeDonation && donationModal) {
        closeDonation.addEventListener('click', () => {
            donationModal.classList.add('hidden');
            donationModal.classList.remove('flex');
        });
    }

    // Crypto buttons
    document.querySelectorAll('.crypto-btn, .crypto-btn-usdt').forEach(btn => {
        btn.addEventListener('click', function() {
            const address = this.dataset.address;
            const name = this.dataset.name;
            const cryptoModal = document.getElementById('crypto-modal');
            const cryptoType = document.getElementById('crypto-type');
            const cryptoAddress = document.getElementById('crypto-address');
            const cryptoIcon = document.getElementById('crypto-icon');
            
            if (cryptoType) cryptoType.textContent = name;
            if (cryptoAddress) cryptoAddress.textContent = address;
            if (cryptoIcon) {
                // Set appropriate icon based on crypto type
                if (name?.includes('Bitcoin')) cryptoIcon.className = 'fab fa-bitcoin text-3xl text-orange-500';
                else if (name?.includes('Ethereum')) cryptoIcon.className = 'fab fa-ethereum text-3xl text-blue-500';
                else if (name?.includes('Solana')) cryptoIcon.className = 'fas fa-sun text-3xl text-purple-500';
                else if (name?.includes('BNB')) cryptoIcon.className = 'fas fa-bolt text-3xl text-yellow-500';
                else if (name?.includes('Polygon')) cryptoIcon.className = 'fas fa-hexagon text-3xl text-indigo-500';
                else if (name?.includes('XRP')) cryptoIcon.className = 'fas fa-chart-line text-3xl text-cyan-500';
                else cryptoIcon.className = 'fas fa-coins text-3xl text-gray-600 dark:text-gray-400';
            }
            
            if (cryptoModal) {
                cryptoModal.classList.remove('hidden');
                cryptoModal.classList.add('flex');
            }
        });
    });

    // Copy crypto address
    const copyCryptoBtn = document.getElementById('copy-crypto-address');
    if (copyCryptoBtn) {
        copyCryptoBtn.addEventListener('click', function() {
            const address = document.getElementById('crypto-address')?.textContent;
            if (address) {
                navigator.clipboard.writeText(address).then(() => {
                    const originalText = this.innerHTML;
                    this.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
                    this.classList.add('bg-green-600');
                    setTimeout(() => {
                        this.innerHTML = originalText;
                        this.classList.remove('bg-green-600');
                    }, 2000);
                }).catch(() => {
                    alert('Failed to copy address');
                });
            }
        });
    }

    // Close crypto modal
    const closeCryptoModal = document.getElementById('close-crypto-modal');
    const cryptoModal = document.getElementById('crypto-modal');
    if (closeCryptoModal && cryptoModal) {
        closeCryptoModal.addEventListener('click', () => {
            cryptoModal.classList.add('hidden');
            cryptoModal.classList.remove('flex');
        });
    }

    // ZVERSE modal
    const zverseBtn = document.getElementById('zverse-btn');
    const zverseModal = document.getElementById('zverse-modal');
    const closeZverse = document.getElementById('close-zverse');
    
    if (zverseBtn && zverseModal) {
        zverseBtn.addEventListener('click', () => {
            zverseModal.classList.remove('hidden');
            zverseModal.classList.add('flex');
        });
    }
    
    if (closeZverse && zverseModal) {
        closeZverse.addEventListener('click', () => {
            zverseModal.classList.add('hidden');
            zverseModal.classList.remove('flex');
        });
    }

    // MENU modal
    const menuBtn = document.getElementById('menu-btn');
    const menuModal = document.getElementById('menu-modal');
    const closeMenu = document.getElementById('close-menu');
    
    if (menuBtn && menuModal) {
        menuBtn.addEventListener('click', () => {
            ui.loadQuicklinks();
            menuModal.classList.remove('hidden');
            menuModal.classList.add('flex');
        });
    }
    
    if (closeMenu && menuModal) {
        closeMenu.addEventListener('click', () => {
            menuModal.classList.add('hidden');
            menuModal.classList.remove('flex');
        });
    }

    // Quicklink content modal
    const closeQuicklinkContent = document.getElementById('close-quicklink-content');
    const quicklinkContentModal = document.getElementById('quicklink-content-modal');
    
    if (closeQuicklinkContent && quicklinkContentModal) {
        closeQuicklinkContent.addEventListener('click', () => {
            quicklinkContentModal.classList.add('hidden');
            quicklinkContentModal.classList.remove('flex');
        });
    }

    // Image modal close
    const closeImageModal = document.getElementById('close-image-modal');
    if (closeImageModal && elements.imageModal) {
        closeImageModal.addEventListener('click', () => {
            elements.imageModal.classList.add('hidden');
            elements.imageModal.classList.remove('flex');
            document.body.style.overflow = 'auto';
        });
    }
    
    if (elements.imageModal) {
        elements.imageModal.addEventListener('click', (e) => {
            if (e.target === elements.imageModal) {
                elements.imageModal.classList.add('hidden');
                elements.imageModal.classList.remove('flex');
                document.body.style.overflow = 'auto';
            }
        });
    }

    // Pagination
    const prevPage = document.getElementById('prev-page');
    const nextPage = document.getElementById('next-page');
    
    if (prevPage) {
        prevPage.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                ui.renderGallery();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
    
    if (nextPage) {
        nextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(state.filteredPhotos.length / ITEMS_PER_PAGE);
            if (state.currentPage < totalPages) {
                state.currentPage++;
                ui.renderGallery();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // COMITBASE pagination
    const comitbasePrev = document.getElementById('comitbase-prev');
    const comitbaseNext = document.getElementById('comitbase-next');
    
    if (comitbasePrev) {
        comitbasePrev.addEventListener('click', () => {
            if (state.currentComitbasePage > 1) {
                state.currentComitbasePage--;
                ui.renderComitbaseGallery();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
    
    if (comitbaseNext) {
        comitbaseNext.addEventListener('click', () => {
            const totalPages = Math.ceil(state.comitbasePhotos.length / ITEMS_PER_PAGE);
            if (state.currentComitbasePage < totalPages) {
                state.currentComitbasePage++;
                ui.renderComitbaseGallery();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // DTREASURE pagination
    const dtreasurePrev = document.getElementById('dtreasure-prev');
    const dtreasureNext = document.getElementById('dtreasure-next');
    
    if (dtreasurePrev) {
        dtreasurePrev.addEventListener('click', () => {
            if (state.currentDtreasurePage > 1) {
                state.currentDtreasurePage--;
                ui.renderDtreasureGallery();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
    
    if (dtreasureNext) {
        dtreasureNext.addEventListener('click', () => {
            const totalPages = Math.ceil(state.dtreasurePhotos.length / ITEMS_PER_PAGE);
            if (state.currentDtreasurePage < totalPages) {
                state.currentDtreasurePage++;
                ui.renderDtreasureGallery();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // COMIT HERE button
    const comitHereBtn = document.getElementById('comit-here-btn');
    if (comitHereBtn) {
        comitHereBtn.addEventListener('click', () => {
            const subject = "COMITBASE Submission - Visual Composition";
            const body = `Title:
Artist Name:
Platform Name:
Art Desc (optional):
Visual Link: (Google Drive only)

---
Submitted via ZXAION VERSE COMITBASE`;
            window.open(`mailto:zxaionxl@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
        });
    }

    // Buy Credits modal
    const buyCreditsBtn = document.getElementById('buy-credits-btn');
    const buyCreditsModal = document.getElementById('buy-credits-modal');
    const closeBuyCredits = document.getElementById('close-buy-credits');
    
    if (buyCreditsBtn && buyCreditsModal) {
        buyCreditsBtn.addEventListener('click', () => {
            ui.renderCreditPacks();
            buyCreditsModal.classList.remove('hidden');
            buyCreditsModal.classList.add('flex');
        });
    }
    
    if (closeBuyCredits && buyCreditsModal) {
        closeBuyCredits.addEventListener('click', () => {
            buyCreditsModal.classList.add('hidden');
            buyCreditsModal.classList.remove('flex');
            // Reset PayPal container
            if (elements.paypalButtonContainer) {
                elements.paypalButtonContainer.classList.add('hidden');
            }
            if (elements.paypalButtons) {
                elements.paypalButtons.innerHTML = '';
            }
            // Remove selected state
            document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
            state.selectedCreditPack = null;
        });
    }

    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkmode-toggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('darkMode', isDark);
        });
    }

    // Initialize dark mode from localStorage
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        document.documentElement.classList.add('dark');
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // ESC to close modals
        if (e.key === 'Escape') {
            const modals = [
                elements.imageModal,
                document.getElementById('donation-modal'),
                document.getElementById('zverse-modal'),
                document.getElementById('menu-modal'),
                document.getElementById('quicklink-content-modal'),
                document.getElementById('buy-credits-modal'),
                document.getElementById('crypto-modal')
            ];
            
            modals.forEach(modal => {
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }
            });
            
            document.body.style.overflow = 'auto';
        }
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.classList.add('hidden');
                backdrop.classList.remove('flex');
                document.body.style.overflow = 'auto';
            }
        });
    });
}

// --- PayPal Integration ---
let paypalButtonsInstance = null;

function initPayPalPurchase(packKey, price) {
    if (!window.paypal) {
        alert('❌ PayPal SDK not loaded. Please try again later.');
        return;
    }

    // ✅ Destroy previous instance properly
    if (paypalButtonsInstance) {
        try {
            paypalButtonsInstance.close();
        } catch (e) {
            console.warn('Error closing previous PayPal instance:', e);
        }
        paypalButtonsInstance = null;
    }

    // Show PayPal container
    if (elements.paypalButtonContainer) {
        elements.paypalButtonContainer.classList.remove('hidden');
    }

    // Clear previous buttons
    if (elements.paypalButtons) {
        elements.paypalButtons.innerHTML = '';
    }

    try {
        paypalButtonsInstance = paypal.Buttons({
            style: {
                shape: 'pill',
                color: 'gold',
                layout: 'vertical',
                label: 'paypal'
            },
            createOrder: (data, actions) => {
    const token = getOrCreateUserToken();
    return actions.order.create({
        purchase_units: [{
            description: `ZXAION Credits: ${packKey}`,
            custom_id: token, // ✅ Dikirim ke webhook untuk identifikasi user
            amount: {
                currency_code: 'USD',
                value: price.toString()
            }
        }]
    });
},
            // ✅ PERBAIKAN - Replace bagian `onApprove` dalam PayPal Buttons

            onApprove: async (data, actions) => {
    let capturedOrderId = null;
    
    try {
        console.log('📦 Payment approved, capturing order...');
        
        // Step 1: Capture payment
        const order = await actions.order.capture();
        capturedOrderId = order.id;
        console.log('✅ Payment captured:', capturedOrderId);
        
        // Step 2: Verify + credit di server (dengan retry logic)
        let result = null;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries && !result) {
          try {
            result = await api.purchaseCredits(packKey, capturedOrderId);
            if (result.success) break;
            
            // Jika gagal, tunggu sebelum retry
            if (retryCount < maxRetries - 1) {
              console.log(`⏳ Retry ${retryCount + 1}/${maxRetries - 1}...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            retryCount++;
          } catch (e) {
            console.error(`Attempt ${retryCount + 1} error:`, e);
            retryCount++;
          }
        }
        
        if (result && result.success) {
          // ✅ Update state lokal
          state.credits = result.newBalance;
          state.lifetime = result.lifetime || false;
          ui.updateCreditDisplay();
          
          // ✅ Re-fetch dari server untuk memastikan sinkronisasi
          await api.fetchCreditBalance();
          // TAMBAH baris ini tepat setelah: await api.fetchCreditBalance();
api.invalidateCache(); // ✅ Force re-fetch list di next page load
          
          // ✅ Tampilkan notifikasi sukses
          const successMsg = state.lifetime ?
            '✅ Lifetime Access Activated!\n\nEnjoy unlimited downloads on DTREASURE collection.' :
            `✅ Purchase Successful!\n\nYou now have ${result.newBalance} credits.`;
          
          alert(successMsg);
          
          // Close modal
          const buyCreditsModal = document.getElementById('buy-credits-modal');
          if (buyCreditsModal) {
            buyCreditsModal.classList.add('hidden');
            buyCreditsModal.classList.remove('flex');
          }
          document.body.style.overflow = 'auto';
          
          // Reset PayPal UI
          if (elements.paypalButtonContainer) {
            elements.paypalButtonContainer.classList.add('hidden');
          }
          if (elements.paypalButtons) {
            elements.paypalButtons.innerHTML = '';
          }
          paypalButtonsInstance = null;
          
          // Refresh DTREASURE gallery
          if (state.currentCategory === 'DTREASURE') {
            ui.renderDtreasureGallery();
          }
          
        } else {
          // ✅ Server verification failed tapi payment sudah di-capture
          const errorMsg = result?.error || 'Credits could not be applied automatically';
          const orderId = result?.orderId || capturedOrderId;
          
          console.error('❌ Verification failed:', errorMsg);
          
          alert(
            `⚠️ Payment Received But Auto-Credit Failed\n\n` +
            `Payment was successfully processed. However, credits could not be applied automatically.\n\n` +
            `Order ID: ${orderId}\n\n` +
            `What to do:\n` +
            `1. Screenshot this message\n` +
            `2. Email: zxaionxl@gmail.com\n` +
            `3. Include Order ID above\n` +
            `4. We'll add credits within 24 hours\n\n` +
            `Sorry for the inconvenience!`
          );
        }
        
    } catch (error) {
        console.error('❌ PayPal onApprove error:', error);
        
        const orderIdMsg = capturedOrderId ? `\n\nOrder ID: ${capturedOrderId}` : '';
        
        alert(
          `❌ Payment Processing Error${orderIdMsg}\n\n` +
          `${error.message || 'An unexpected error occurred.'}\n\n` +
          `If you were charged, please contact support with the Order ID above.`
        );
    }
},
            onError: (err) => {
                console.error('PayPal error:', err);
                alert('❌ PayPal error. Please try again.');
            },
            onCancel: () => {
                console.log('User cancelled payment');
            }
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
    if (success) {
        ui.changeCategory(state.currentCategory);
    }
};

window.changeCategory = (category) => {
    ui.changeCategory(category);
};

window.openAnimeCollection = (albumTitle) => {
    ui.openAnimeAlbum(albumTitle);
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize logo
    ui.initLogo();
    
    // Initialize events
    initEvents();
    
    // Load credits
    await api.fetchCreditBalance();
    
    // Fetch data
    await api.fetchImages();
    await api.fetchComitbaseImages();
    await api.fetchDtreasureImages();
    
    // Start with All category
    ui.changeCategory('All');
    
    // Add scroll listener for nav shadow
    window.addEventListener('scroll', () => {
        const nav = document.querySelector('nav');
        if (nav) {
            if (window.scrollY > 10) {
                nav.classList.add('scrolled');
            } else {
                nav.classList.remove('scrolled');
            }
        }
    });
});
