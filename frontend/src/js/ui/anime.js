/**
 * ui/anime.js — Kartu koleksi/album anime dan pembukaan album.
 * Depends on: ui (base.js), state, elements, utils, API_BASE, window.animeAlbumThumbnails
 */
Object.assign(ui, {
    renderAnimeCollections() {
        if (!elements.animeGrid) return;
        elements.animeGrid.innerHTML = '';

        const serverAlbums = Array.isArray(state.animeAlbumServerList) && state.animeAlbumServerList.length > 0
            ? state.animeAlbumServerList
            : [];
        const localTitles = Object.keys(state.animeAlbums || {});

        let albumTitles = [];
        if (serverAlbums.length > 0 || localTitles.length > 0) {
            const seen = new Set();
            const merged = [];
            serverAlbums.forEach((item) => {
                const t = item.title;
                if (!t || t === 'ORIGINAL') return;
                const k = t.toLowerCase();
                if (!seen.has(k)) {
                    seen.add(k);
                    merged.push(t);
                }
            });
            localTitles.forEach((t) => {
                if (!t || t === 'ORIGINAL') return;
                const k = t.toLowerCase();
                if (!seen.has(k)) {
                    seen.add(k);
                    merged.push(t);
                }
            });
            // Keep canonical ANIME_SUB_ALBUMS ordering for known series, then append new dynamic albums alphabetically
            const orderMap = new Map(ANIME_SUB_ALBUMS.map((t, idx) => [t.toLowerCase(), idx]));
            merged.sort((a, b) => {
                const ia = orderMap.has(a.toLowerCase()) ? orderMap.get(a.toLowerCase()) : Number.MAX_SAFE_INTEGER;
                const ib = orderMap.has(b.toLowerCase()) ? orderMap.get(b.toLowerCase()) : Number.MAX_SAFE_INTEGER;
                if (ia !== ib) return ia - ib;
                return a.localeCompare(b);
            });
            albumTitles = merged;
        } else if (Array.isArray(api.imageCache?.animeAlbums)) {
            albumTitles = [];
        } else {
            albumTitles = ANIME_SUB_ALBUMS.filter(title => title !== 'ORIGINAL');
        }

        if (albumTitles.length === 0) {
            elements.animeGrid.innerHTML = `
                <div class="col-span-full text-center py-12 bg-white/70 dark:bg-gray-900/70 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                    <i class="fas fa-images text-3xl text-gray-400 mb-3" aria-hidden="true"></i>
                    <p class="text-sm font-semibold text-gray-600 dark:text-gray-300">No Anime sub-albums available yet.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        const cardFallbackSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='480'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23111827'/%3E%3Cstop offset='100%25' stop-color='%23312e81'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='480' height='480'/%3E%3C/svg%3E";

        albumTitles.forEach((title, index) => {
            const album = state.animeAlbums[title];
            const card  = document.createElement('div');
            card.className = 'anime-collection-card aspect-square relative cursor-pointer group fade-in';
            card.style.animationDelay = `${Math.min(index, 12) * 25}ms`;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', `Open ${title} Anime album`);

            const normTitle       = utils.normalizeAlbumKey(title);
            const configuredThumb = window.animeAlbumThumbnails?.[title] || '';
            const firstPhotoUrl   = album?.photos?.[0]?.url || '';
            const serverSampleUrl = state.animeAlbumThumbs?.[normTitle] || '';
            const primaryRaw      = configuredThumb || firstPhotoUrl || serverSampleUrl || '/api/img/HEADER/Anime.jpg';
            const extraRaw        = [];
            if (firstPhotoUrl && firstPhotoUrl !== primaryRaw) extraRaw.push(firstPhotoUrl);
            if (serverSampleUrl && serverSampleUrl !== primaryRaw) extraRaw.push(serverSampleUrl);
            extraRaw.push('/api/img/HEADER/Anime.jpg');

            const candidates = utils.getImageFallbackCandidates(
                primaryRaw,
                { w: 480, h: 480, q: 80, fit: 'cover', fmt: 'auto' },
                extraRaw
            );

            const safeTitle = utils.escapeHtml(title);
            const serverCount = state.animeAlbumCounts?.[normTitle] || 0;
            const count = Math.max(album ? album.photos.length : 0, serverCount);

            card.innerHTML = `
                <div class="w-full h-full relative overflow-hidden rounded-2xl">
                    <img class="anime-thumb-img w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110 loading-shimmer" loading="lazy" decoding="async" alt="${safeTitle}">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-4 pointer-events-none">
                        <h3 class="text-white font-black text-center uppercase text-sm md:text-base leading-tight drop-shadow-lg line-clamp-2">${safeTitle}</h3>
                        <p class="text-white/70 text-center text-xs mt-1 font-semibold">${count} ${count === 1 ? 'item' : 'items'}</p>
                    </div>
                </div>
            `;

            const img = card.querySelector('img.anime-thumb-img');
            if (img) {
                const firstSrc = utils.attachImageFallback(img, candidates, {
                    fallbackSvg: cardFallbackSvg,
                    onLoadSuccess(el) { el.classList.remove('loading-shimmer'); },
                    onFinalError(el) {
                        el.classList.remove('loading-shimmer');
                        el.src = cardFallbackSvg;
                    },
                });
                img.src = firstSrc || cardFallbackSvg;
            }

            card.addEventListener('click', () => this.openAnimeAlbum(title));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.openAnimeAlbum(title);
                }
            });
            fragment.appendChild(card);
        });

        elements.animeGrid.appendChild(fragment);
    },

    async openAnimeAlbum(albumTitle) {
        state.currentAnimeAlbum = albumTitle;
        const album = state.animeAlbums[albumTitle];

        state.filteredPhotos = state.allPhotos.filter(photo =>
            photo.category && photo.category.toLowerCase() === 'anime' &&
            photo.subCategory && api._matchSubCategory(photo.subCategory, album?.folderName, albumTitle)
        );

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
        state.sortBy      = 'latest';
        if (typeof this.invalidateMainSortCache === 'function') this.invalidateMainSortCache();
        this.showToolbar();
        this.renderGallery();
        elements.galleryContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Fetch langsung dari server jika cache lokal belum lengkap atau belum memuat sub-album ini
        const needServerFetch = state.filteredPhotos.length === 0 || (api.imageCache?.totalMain || 0) > state.allPhotos.length;
        if (needServerFetch) {
            const normTarget = utils.normalizeAlbumKey(albumTitle);
            const serverAlbumMatch = Array.isArray(api.imageCache?.animeAlbums)
                ? api.imageCache.animeAlbums.find(a => utils.normalizeAlbumKey(a.sub_category) === normTarget)?.sub_category
                : null;
            const subCandidates = [...new Set([
                album?.folderName,
                serverAlbumMatch,
                albumTitle === 'ORIGINAL' ? 'random' : albumTitle,
                normTarget,
            ].filter(Boolean))];

            for (const sub of subCandidates) {
                try {
                    const res = await fetch(`${API_BASE}/api/list?category=Anime&subCategory=${encodeURIComponent(sub)}&limit=500`);
                    if (!res.ok) continue;
                    const fetched = await res.json();
                    if (Array.isArray(fetched) && fetched.length > 0 && state.currentAnimeAlbum === albumTitle && state.currentCategory === 'Anime') {
                        state.filteredPhotos = fetched;
                        if (heroDesc) heroDesc.textContent = `${fetched.length} high quality wallpapers`;
                        this.invalidateMainSortCache();
                        this.renderGallery();
                        break;
                    }
                } catch {
                    // abaikan error jaringan sementara
                }
            }
        }
    },
});
