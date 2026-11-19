/**
 * services/api-gallery.js — Membuat objek `api` + fetch katalog gambar (main, COMITBASE, DTREASURE), cache, album anime.
 * Depends on: API_BASE, ANIME_SUB_ALBUMS, state, ui
 */
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
    },
};
