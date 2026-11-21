/**
 * services/api-gallery.js — Membuat objek `api` + fetch katalog gambar (progressive background loading), cache, album anime.
 * Depends on: API_BASE, ANIME_SUB_ALBUMS, state, ui
 */
// --- API Calls ---
const api = {
    imageCache: {
        main:        null,
        comitbase:   null,
        dtreasure:   null,
        animeAlbums: null,
        totalMain:   0,
        timestamp:   0,
    },

    _filterHeader(items) {
        return items.filter(photo => !photo.path || !photo.path.toLowerCase().startsWith('header/'));
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

            const PAGE_SIZE = 500;
            const res = await fetch(`${API_BASE}/api/list?page=1&limit=${PAGE_SIZE}`);
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

            const totalHeader = parseInt(res.headers.get('X-Total-Count') || '0', 10);
            const firstPage   = await res.json();
            if (!Array.isArray(firstPage)) throw new Error('Invalid gallery payload');

            const filtered = this._filterHeader(firstPage);
            this.imageCache.main      = filtered;
            this.imageCache.totalMain = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : filtered.length;
            this.imageCache.timestamp = now;

            state.allPhotos = filtered;
            this.organizeAnimeAlbums();
            ui.updateOriginalAlbumCount();

            if (firstPage.length === PAGE_SIZE) {
                this._loadRemainingMainPages(PAGE_SIZE, now);
            }

            return true;
        } catch (e) {
            console.error('Error fetching images:', e);
            ui.showEmptyState();
            return false;
        }
    },

    async _loadRemainingMainPages(pageSize, cacheStamp) {
        const MAX_PAGES = 50;
        let page = 2;

        try {
            while (page <= MAX_PAGES && this.imageCache.timestamp === cacheStamp) {
                const res = await fetch(`${API_BASE}/api/list?page=${page}&limit=${pageSize}`);
                if (!res.ok) break;
                const data = await res.json();
                if (!Array.isArray(data) || data.length === 0) break;

                const nextItems = this._filterHeader(data);
                if (this.imageCache.timestamp !== cacheStamp) break;

                this.imageCache.main = (this.imageCache.main || []).concat(nextItems);
                state.allPhotos      = this.imageCache.main;
                this.organizeAnimeAlbums();
                ui.updateOriginalAlbumCount();

                if (state.currentCategory === 'Anime' && !state.currentAnimeAlbum && typeof ui.renderAnimeCollections === 'function') {
                    ui.renderAnimeCollections();
                } else if (!state.searchQuery && state.currentCategory !== 'COMITBASE' && state.currentCategory !== 'DTREASURE') {
                    if (state.currentCategory === 'All') {
                        const existingIds = new Set(state.filteredPhotos.map(p => p.id));
                        const addedAnime  = nextItems.filter(p => p.category && p.category.toLowerCase() === 'anime' && !existingIds.has(p.id));
                        if (addedAnime.length > 0) {
                            state.filteredPhotos = state.filteredPhotos.concat(addedAnime);
                            if (typeof ui.updatePagination === 'function') ui.updatePagination();
                        }
                    } else if (state.currentCategory === 'Anime' && state.currentAnimeAlbum) {
                        const album = state.animeAlbums[state.currentAnimeAlbum];
                        if (album) {
                            state.filteredPhotos = state.allPhotos.filter(photo =>
                                photo.category && photo.category.toLowerCase() === 'anime' &&
                                photo.subCategory && photo.subCategory.toLowerCase() === album.folderName.toLowerCase()
                            );
                            if (typeof ui.updatePagination === 'function') ui.updatePagination();
                        }
                    } else {
                        state.filteredPhotos = state.allPhotos.filter(photo =>
                            photo.category && photo.category.toLowerCase() === state.currentCategory.toLowerCase()
                        );
                        if (typeof ui.updatePagination === 'function') ui.updatePagination();
                    }
                }

                if (data.length < pageSize) break;
                page++;
            }
        } catch (e) {
            console.warn('Background pagination interrupted:', e.message);
        }
    },

    async fetchAnimeAlbums() {
        try {
            const now = Date.now();
            if (this.imageCache.animeAlbums && (now - this.imageCache.timestamp) < 300000) {
                return this.imageCache.animeAlbums;
            }
            const res = await fetch(`${API_BASE}/api/anime/albums`);
            if (!res.ok) return null;
            const albums = await res.json();
            if (Array.isArray(albums)) {
                this.imageCache.animeAlbums = albums;
                return albums;
            }
            return null;
        } catch {
            return null;
        }
    },

    invalidateCache() {
        this.imageCache.main        = null;
        this.imageCache.comitbase   = null;
        this.imageCache.dtreasure   = null;
        this.imageCache.animeAlbums = null;
        this.imageCache.totalMain   = 0;
        this.imageCache.timestamp   = 0;
    },

    async _fetchPaginatedBucket(endpoint, cacheKey, stateKey) {
        const now = Date.now();
        if (this.imageCache[cacheKey] && (now - this.imageCache.timestamp) < 300000) {
            state[stateKey] = this.imageCache[cacheKey];
            return true;
        }

        const PAGE_SIZE = 500;
        const res = await fetch(`${API_BASE}${endpoint}?page=1&limit=${PAGE_SIZE}`);
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        const firstPage = await res.json();
        if (!Array.isArray(firstPage)) return false;

        this.imageCache[cacheKey] = firstPage;
        if (!this.imageCache.timestamp) this.imageCache.timestamp = now;
        state[stateKey] = firstPage;

        if (firstPage.length === PAGE_SIZE) {
            (async () => {
                let page = 2;
                while (page <= 50) {
                    const nextRes = await fetch(`${API_BASE}${endpoint}?page=${page}&limit=${PAGE_SIZE}`);
                    if (!nextRes.ok) break;
                    const data = await nextRes.json();
                    if (!Array.isArray(data) || data.length === 0) break;
                    this.imageCache[cacheKey] = (this.imageCache[cacheKey] || []).concat(data);
                    state[stateKey] = this.imageCache[cacheKey];
                    if (cacheKey === 'comitbase' && state.currentCategory === 'COMITBASE' && typeof ui.updateComitbasePagination === 'function') {
                        ui.updateComitbasePagination();
                    }
                    if (cacheKey === 'dtreasure' && state.currentCategory === 'DTREASURE' && typeof ui.updateDtreasurePagination === 'function') {
                        ui.updateDtreasurePagination();
                    }
                    if (data.length < PAGE_SIZE) break;
                    page++;
                }
            })().catch(() => {});
        }
        return true;
    },

    async fetchComitbaseImages() {
        try {
            return await this._fetchPaginatedBucket('/api/comitbase/list', 'comitbase', 'comitbasePhotos');
        } catch (e) {
            console.error('Error fetching COMITBASE:', e);
            return false;
        }
    },

    async fetchDtreasureImages() {
        try {
            return await this._fetchPaginatedBucket('/api/dtreasure/list', 'dtreasure', 'dtreasurePhotos');
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
