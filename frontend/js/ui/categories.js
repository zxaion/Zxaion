// frontend/js/ui/categories.js
// UI kategori, hero section, dan navigasi kategori
import { ads } from '../ads/ads.js';
import { state } from '../state/appState.js';
import { elements } from './elements.js';
import { ui } from './index.js';
import { utils } from '../utils/helpers.js';

Object.assign(ui, {
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
        if (state.carouselRefreshTimer) {
            clearInterval(state.carouselRefreshTimer);
            state.carouselRefreshTimer = null;
        }

        if (category === 'All') {
            if (elements.galleryContainer) elements.galleryContainer.classList.remove('hidden');
            state.filteredPhotos = utils.shuffleArray(
                state.allPhotos.filter(p => p.category && p.category.toLowerCase() === 'anime')
            );
            this.renderGallery();

            // Render carousel, lalu auto-refresh setiap 2 menit
            this.renderTopRankingCarousel().catch(e => console.error('renderTopRankingCarousel error:', e));
            state.carouselRefreshTimer = setInterval(() => {
                if (state.currentCategory === 'All') {
                    ui.renderTopRankingCarousel().catch(() => {});
                } else {
                    clearInterval(state.carouselRefreshTimer);
                    state.carouselRefreshTimer = null;
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
});

// ============================================================
// Dynamic sticky top — kalkulasi otomatis berdasarkan tinggi
// nav + mobile search agar category-nav tidak overlap elemen lain.
// ============================================================
export function updateCategoryNavTop() {
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
