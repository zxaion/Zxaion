/**
 * API/data access service. UI callbacks are injected lazily so the service
 * can be constructed before the UI object without a circular dependency.
 */
export function createApiService({ API_BASE, ANIME_SUB_ALBUMS, state, getOrCreateUserToken, utils, getUi }) {
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
                    getUi().updateOriginalAlbumCount();
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
                getUi().updateOriginalAlbumCount();
                return true;
            } catch (e) {
                console.error('Error fetching images:', e);
                getUi().showEmptyState();
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
                getUi().updateCreditDisplay();
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
    return api;
}
