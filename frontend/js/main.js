// frontend/js/main.js
// Entry point (type=module): merakit modul dan mendaftarkan bridge window untuk onclick di HTML
import { ads } from './ads/ads.js';
import { api } from './api/index.js';
import { initEvents } from './events/initEvents.js';
import { state } from './state/appState.js';
import { updateCategoryNavTop } from './ui/categories.js';
import { ui } from './ui/index.js';
import './config/assets.js';
import './api/images.js';
import './api/stats.js';
import './api/credits.js';
import './ui/states.js';
import './ui/modal.js';
import './ui/gallery.js';
import './ui/download.js';
import './ui/pagination.js';
import './ui/anime.js';
import './ui/comitbase.js';
import './ui/dtreasure.js';
import './ui/categories.js';
import './ui/carousel.js';
import './ui/search.js';
import './ui/credits.js';
import './ui/branding.js';
import './ui/quicklinks.js';

window.refreshImages = async () => {
    ui.hideEmptyState();
    const success = await api.fetchImages();
    if (success) ui.changeCategory(state.currentCategory);
};

window.changeCategory    = (category)    => ui.changeCategory(category);
window.openAnimeCollection = (albumTitle) => ui.openAnimeAlbum(albumTitle);

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    ui.initLogo();
    ui.initIcons();
    initEvents();

    // Dynamic sticky top — kalkulasi saat load dan saat resize
    updateCategoryNavTop();
    const _resizeObserver = new ResizeObserver(() => updateCategoryNavTop());
    const _navEl          = document.querySelector('nav');
    const _searchEl       = document.getElementById('mobile-search-bar');
    if (_navEl)    _resizeObserver.observe(_navEl);
    if (_searchEl) _resizeObserver.observe(_searchEl);

    // Fetch semua data paralel — maksimalkan performa awal
    await Promise.all([
        api.fetchCreditBalance(),
        api.fetchImages(),
        api.fetchComitbaseImages(),
        api.fetchDtreasureImages(),
    ]);

    ui.changeCategory('All');
    ads.initStaticSlots();

    // Sticky nav shadow on scroll
    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        nav?.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });

    // Carousel scroll buttons
    const rankingCarousel = document.getElementById('ranking-carousel');
    document.getElementById('carousel-scroll-left')?.addEventListener('click', () => {
        rankingCarousel?.scrollBy({ left: -420, behavior: 'smooth' });
    });
    document.getElementById('carousel-scroll-right')?.addEventListener('click', () => {
        rankingCarousel?.scrollBy({ left: 420, behavior: 'smooth' });
    });

    // Mouse drag-to-scroll untuk carousel desktop
    if (rankingCarousel) {
        let isDragging   = false;
        let startX       = 0;
        let scrollLeftAt = 0;

        rankingCarousel.addEventListener('mousedown', (e) => {
            isDragging   = true;
            startX       = e.pageX - rankingCarousel.offsetLeft;
            scrollLeftAt = rankingCarousel.scrollLeft;
            rankingCarousel.style.userSelect = 'none';
        });

        const stopDrag = () => { isDragging = false; rankingCarousel.style.removeProperty('user-select'); };
        rankingCarousel.addEventListener('mouseleave', stopDrag);
        rankingCarousel.addEventListener('mouseup',    stopDrag);
        rankingCarousel.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            rankingCarousel.scrollLeft = scrollLeftAt - ((e.pageX - rankingCarousel.offsetLeft) - startX) * 1.5;
        });
    }
});
