// frontend/js/ui/search.js
// UI pencarian
import { state } from '../state/appState.js';
import { elements } from './elements.js';
import { ui } from './index.js';

Object.assign(ui, {
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
});
