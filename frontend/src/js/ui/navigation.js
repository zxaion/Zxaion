/**
 * ui/navigation.js — Navigasi kategori, hero section, dan pencarian.
 * Depends on: ui (base.js), state, elements, api, window.headerBackgrounds
 */
Object.assign(ui, {
    changeCategory(category, { scroll = true } = {}) {
        if (!category) return;

        state.currentCategory   = category;
        state.currentAnimeAlbum = null;
        state.resetPagination();
        state.searchQuery = '';

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
        if (elements.infiniteLoadMore)    elements.infiniteLoadMore.classList.add('hidden');
        if (typeof this.invalidateMainSortCache === 'function') this.invalidateMainSortCache();

        const rankingSection = document.getElementById('ranking-carousel-section');
        if (rankingSection) rankingSection.classList.toggle('hidden', category !== 'All');

        if (_carouselRefreshTimer) {
            clearInterval(_carouselRefreshTimer);
            _carouselRefreshTimer = null;
        }

        if (category === 'All') {
            state.sortBy = 'random';
            this.showToolbar();
            if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
            state.filteredPhotos = state.allPhotos.filter(p => p.category && p.category.toLowerCase() === 'anime');
            this.renderGallery();

            this.renderTopRankingCarousel().catch(e => console.error('renderTopRankingCarousel error:', e));
            _carouselRefreshTimer = setInterval(() => {
                if (state.currentCategory === 'All' && !state.searchQuery) {
                    ui.renderTopRankingCarousel().catch(() => {});
                } else {
                    clearInterval(_carouselRefreshTimer);
                    _carouselRefreshTimer = null;
                }
            }, 120_000);

        } else if (category === 'Anime') {
            this.hideToolbar();
            if (elements.animeCollections) elements.animeCollections.classList.remove('hidden');
            this.renderAnimeCollections();

        } else if (category === 'COMITBASE') {
            state.sortBy = 'latest';
            this.showToolbar();
            if (elements.comitbaseSection) elements.comitbaseSection.classList.remove('hidden');
            this.renderComitbaseGallery();

        } else if (category === 'DTREASURE') {
            state.sortBy = 'latest';
            this.showToolbar();
            if (elements.dtreasureSection) elements.dtreasureSection.classList.remove('hidden');
            this.renderDtreasureGallery();

        } else {
            state.sortBy = 'latest';
            this.showToolbar();
            if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
            state.filteredPhotos = state.allPhotos.filter(photo =>
                photo.category && photo.category.toLowerCase() === category.toLowerCase()
            );
            this.renderGallery();

            if ((api.imageCache?.totalMain || 0) > state.allPhotos.length || state.filteredPhotos.length === 0) {
                api.fetchCategoryFromServer(category).then(serverItems => {
                    if (!serverItems || state.currentCategory !== category || state.searchQuery) return;
                    if (serverItems.length > state.filteredPhotos.length) {
                        state.filteredPhotos = serverItems;
                        this.invalidateMainSortCache();
                        this.renderGallery();
                    }
                }).catch(() => {});
            }
        }

        this.updateHeroSection(category);
        if (scroll) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
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
            const safeBgUrl = utils.encodeImageUrlPath(window.headerBackgrounds[category]);
            hero.style.backgroundImage = `url('${safeBgUrl}')`;
        }

        const actions = document.getElementById('hero-actions');
        if (actions) actions.innerHTML = '';
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

            const rankingSection = document.getElementById('ranking-carousel-section');
            if (rankingSection) rankingSection.classList.add('hidden');

            const actions = document.getElementById('hero-actions');
            if (actions) actions.innerHTML = '';

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
            state.sortBy         = 'latest';
            if (typeof this.invalidateMainSortCache === 'function') this.invalidateMainSortCache();
            this.showToolbar();
            this.renderGallery();

            const heroTitle = document.getElementById('hero-title');
            const heroDesc  = document.getElementById('hero-desc');
            if (heroTitle) heroTitle.textContent = `Search: "${query}"`;
            if (heroDesc)  heroDesc.textContent  = `${state.filteredPhotos.length} results found`;

            if ((api.imageCache?.totalMain || 0) > state.allPhotos.length && typeof api.searchCatalogServer === 'function') {
                api.searchCatalogServer(searchTerm).then(serverMatches => {
                    if (state.searchQuery !== searchTerm || !Array.isArray(serverMatches)) return;
                    const mergedById = new Map(state.filteredPhotos.map(p => [p.id, p]));
                    serverMatches.forEach(item => {
                        if (!mergedById.has(item.id)) mergedById.set(item.id, item);
                    });
                    if (mergedById.size > state.filteredPhotos.length) {
                        state.filteredPhotos = Array.from(mergedById.values());
                        this.invalidateMainSortCache();
                        this.renderGallery();
                        if (heroDesc) heroDesc.textContent = `${state.filteredPhotos.length} results found`;
                    }
                }).catch(() => {});
            }
        } else {
            if (elements.searchClear) elements.searchClear.classList.add('hidden');
            state.currentAnimeAlbum = null;
            this.changeCategory(state.currentCategory);
        }
    },
});
