/**
 * ui/anime.js — Kartu koleksi/album anime dan pembukaan album.
 * Depends on: ui (base.js), state, elements, utils, window.animeAlbumThumbnails
 */
Object.assign(ui, {
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
});
