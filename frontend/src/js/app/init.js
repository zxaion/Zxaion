/**
 * app/init.js — Titik masuk aplikasi: DOMContentLoaded → init + fetch data + carousel scroll.
 * Depends on: semua modul di atas
 */
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
