/**
 * services/api-gallery.js — Membuat objek `api` + fetch katalog gambar (progressive background loading), cache, album anime.
 * Depends on: API_BASE, ANIME_SUB_ALBUMS, state, ui
 */
// --- API Calls ---
const api = {
    imageCache: {
        main:           null,
        comitbase:      null,
        dtreasure:      null,
        animeAlbums:    null,
        totalMain:      0,
        totalComitbase: 0,
        totalDtreasure: 0,
        timestamp:      0,
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

            const PAGE_SIZE = 200;
            const [res, albumsRes] = await Promise.all([
                fetch(`${API_BASE}/api/list?page=1&limit=${PAGE_SIZE}`),
                this.fetchAnimeAlbums().catch(() => null),
            ]);
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

            const totalHeader = parseInt(res.headers.get('X-Total-Count') || '0', 10);
            const firstPage   = await res.json();
            if (!Array.isArray(firstPage)) throw new Error('Invalid gallery payload');

            const filtered = this._filterHeader(firstPage);
            this.imageCache.main      = filtered;
            this.imageCache.totalMain = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : filtered.length;
            this.imageCache.timestamp = now;

            state.allPhotos = filtered;
            if (Array.isArray(albumsRes)) {
                this._applyServerAnimeCounts(albumsRes);
            }
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

    _applyServerAnimeCounts(albums) {
        const counts = {};
        const thumbs = {};
        const serverList = [];
        albums.forEach(({ sub_category, count, sample_url }) => {
            if (!sub_category) return;
            const norm = typeof utils !== 'undefined' && typeof utils.normalizeAlbumKey === 'function'
                ? utils.normalizeAlbumKey(sub_category)
                : String(sub_category).toLowerCase();
            if (!norm) return;
            const n = Number(count) || 0;
            counts[norm] = (counts[norm] || 0) + n;
            if (sample_url && !thumbs[norm]) {
                thumbs[norm] = sample_url;
            }
            const resolvedTitle = typeof this._resolveAlbumTitle === 'function'
                ? this._resolveAlbumTitle(sub_category)
                : sub_category;
            if (resolvedTitle) {
                const normTitle = typeof utils !== 'undefined' && typeof utils.normalizeAlbumKey === 'function'
                    ? utils.normalizeAlbumKey(resolvedTitle)
                    : resolvedTitle.toLowerCase();
                if (sample_url && !thumbs[normTitle]) {
                    thumbs[normTitle] = sample_url;
                }
                if (normTitle !== norm) {
                    counts[normTitle] = (counts[normTitle] || 0) + n;
                }
                const existing = serverList.find(item => item.title === resolvedTitle);
                if (existing) {
                    existing.count += n;
                    if (!existing.sample_url && sample_url) existing.sample_url = sample_url;
                } else {
                    serverList.push({
                        sub_category,
                        title: resolvedTitle,
                        count: n,
                        sample_url: sample_url || null,
                    });
                }
            }
        });
        state.animeAlbumCounts = counts;
        state.animeAlbumThumbs = thumbs;
        state.animeAlbumServerList = serverList;
    },

    async _loadRemainingMainPages(pageSize, cacheStamp) {
        // Batasi prefetch latar belakang maksimal 4 halaman (2.000 item); katalog lebih besar dilayani endpoint server (search/category/album)
        const MAX_PREFETCH_PAGES = 4;
        let page = 2;

        try {
            while (page <= MAX_PREFETCH_PAGES && this.imageCache.timestamp === cacheStamp) {
                await new Promise(r => setTimeout(r, 80));
                if (this.imageCache.timestamp !== cacheStamp) break;
                const res = await fetch(`${API_BASE}/api/list?page=${page}&limit=${pageSize}`);
                if (!res.ok) break;
                const data = await res.json();
                if (!Array.isArray(data) || data.length === 0) break;

                const nextItems = this._filterHeader(data);
                if (this.imageCache.timestamp !== cacheStamp) break;

                const seenIds = new Set((this.imageCache.main || []).map(p => p.id));
                const freshItems = nextItems.filter(p => !seenIds.has(p.id));
                this.imageCache.main = (this.imageCache.main || []).concat(freshItems);
                state.allPhotos      = this.imageCache.main;
                this.organizeAnimeAlbums();
                ui.updateOriginalAlbumCount();

                if (state.currentCategory === 'Anime' && !state.currentAnimeAlbum && typeof ui.renderAnimeCollections === 'function') {
                    ui.renderAnimeCollections();
                } else if (!state.searchQuery && state.currentCategory !== 'COMITBASE' && state.currentCategory !== 'DTREASURE') {
                    if (state.currentCategory === 'All') {
                        const existingIds = new Set(state.filteredPhotos.map(p => p.id));
                        const addedAnime  = freshItems.filter(p => p.category && p.category.toLowerCase() === 'anime' && !existingIds.has(p.id));
                        if (addedAnime.length > 0) {
                            state.filteredPhotos = state.filteredPhotos.concat(addedAnime);
                            if (typeof ui.updatePagination === 'function') ui.updatePagination();
                        }
                    } else if (state.currentCategory === 'Anime' && state.currentAnimeAlbum) {
                        const album = state.animeAlbums[state.currentAnimeAlbum];
                        if (album) {
                            state.filteredPhotos = state.allPhotos.filter(photo =>
                                photo.category && photo.category.toLowerCase() === 'anime' &&
                                photo.subCategory && this._matchSubCategory(photo.subCategory, album.folderName, state.currentAnimeAlbum)
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

    async searchCatalogServer(query) {
        const q = String(query || '').trim();
        if (!q) return [];
        const enc = encodeURIComponent(q);
        const [mainRes, comRes, dtRes] = await Promise.allSettled([
            fetch(`${API_BASE}/api/list?q=${enc}&limit=500`),
            fetch(`${API_BASE}/api/comitbase/list?q=${enc}&limit=500`),
            fetch(`${API_BASE}/api/dtreasure/list?q=${enc}&limit=500`),
        ]);
        const merged = [];
        const pushUnique = (items, extra = null) => {
            if (!Array.isArray(items)) return;
            items.forEach(item => {
                if (!item || !item.id) return;
                if (item.path && item.path.toLowerCase().startsWith('header/')) return;
                merged.push(extra ? { ...item, ...extra } : item);
            });
        };
        if (mainRes.status === 'fulfilled' && mainRes.value.ok) {
            pushUnique(await mainRes.value.json().catch(() => []));
        }
        if (comRes.status === 'fulfilled' && comRes.value.ok) {
            pushUnique(await comRes.value.json().catch(() => []), { searchCategory: 'COMITBASE' });
        }
        if (dtRes.status === 'fulfilled' && dtRes.value.ok) {
            pushUnique(await dtRes.value.json().catch(() => []), { searchCategory: 'DTREASURE' });
        }
        return merged;
    },

    async fetchCategoryFromServer(category) {
        try {
            const catParam = category === 'All' ? 'Anime' : category;
            const res = await fetch(`${API_BASE}/api/list?category=${encodeURIComponent(catParam)}&limit=500`);
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data) ? this._filterHeader(data) : null;
        } catch {
            return null;
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
        this.imageCache.main           = null;
        this.imageCache.comitbase      = null;
        this.imageCache.dtreasure      = null;
        this.imageCache.animeAlbums    = null;
        this.imageCache.totalMain      = 0;
        this.imageCache.totalComitbase = 0;
        this.imageCache.totalDtreasure = 0;
        this.imageCache.timestamp      = 0;
    },

    async _fetchPaginatedBucket(endpoint, cacheKey, stateKey, errorKey) {
        const now = Date.now();
        if (this.imageCache[cacheKey] && (now - this.imageCache.timestamp) < 300000) {
            state[stateKey] = this.imageCache[cacheKey];
            if (errorKey) state[errorKey] = false;
            return true;
        }

        const PAGE_SIZE = 200;
        const res = await fetch(`${API_BASE}${endpoint}?page=1&limit=${PAGE_SIZE}`);
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        const totalHeader = parseInt(res.headers.get('X-Total-Count') || '0', 10);
        const firstPage = await res.json();
        if (!Array.isArray(firstPage)) throw new Error('Invalid bucket payload');

        this.imageCache[cacheKey] = firstPage;
        const totalKey = cacheKey === 'comitbase' ? 'totalComitbase' : (cacheKey === 'dtreasure' ? 'totalDtreasure' : null);
        if (totalKey) {
            this.imageCache[totalKey] = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : firstPage.length;
        }
        if (!this.imageCache.timestamp) this.imageCache.timestamp = now;
        state[stateKey] = firstPage;
        if (errorKey) state[errorKey] = false;

        if (firstPage.length === PAGE_SIZE) {
            (async () => {
                let page = 2;
                while (page <= 4) {
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
            state.comitbaseError = false;
            return await this._fetchPaginatedBucket('/api/comitbase/list', 'comitbase', 'comitbasePhotos', 'comitbaseError');
        } catch (e) {
            console.error('Error fetching COMITBASE:', e);
            state.comitbaseError = true;
            return false;
        }
    },

    async fetchDtreasureImages() {
        try {
            state.dtreasureError = false;
            return await this._fetchPaginatedBucket('/api/dtreasure/list', 'dtreasure', 'dtreasurePhotos', 'dtreasureError');
        } catch (e) {
            console.error('Error fetching DTREASURE:', e);
            state.dtreasureError = true;
            return false;
        }
    },

    _resolveAlbumTitle(folderName) {
        if (!folderName) return null;
        const normFolder = utils.normalizeAlbumKey(folderName);
        if (!normFolder) return null;
        if (normFolder === 'random' || normFolder === 'original') return 'ORIGINAL';

        const exact = ANIME_SUB_ALBUMS.find(album => utils.normalizeAlbumKey(album) === normFolder);
        if (exact) return exact;

        if (normFolder.length >= 4) {
            const partial = ANIME_SUB_ALBUMS.find(album => {
                const normAlbum = utils.normalizeAlbumKey(album);
                return normAlbum.length >= 4 && (normFolder.includes(normAlbum) || normAlbum.includes(normFolder));
            });
            if (partial) return partial;
        }

        return folderName
            .replace(/[-_]+/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    },

    _matchSubCategory(subCategory, folderName, albumTitle) {
        if (!subCategory) return false;
        const normSub = utils.normalizeAlbumKey(subCategory);
        if (folderName && normSub === utils.normalizeAlbumKey(folderName)) return true;
        if (albumTitle && utils.normalizeAlbumKey(albumTitle) === normSub) return true;
        return this._resolveAlbumTitle(subCategory) === albumTitle;
    },

    organizeAnimeAlbums() {
        state.animeAlbums = {};
        state.allPhotos.forEach(photo => {
            if (photo.category && photo.category.toLowerCase() === 'anime' && photo.subCategory) {
                const folderName = photo.subCategory;
                const albumTitle = this._resolveAlbumTitle(folderName);

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
