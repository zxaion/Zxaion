/**
 * app/init.js — Titik masuk aplikasi: DOMContentLoaded → init + fetch data + carousel scroll.
 * Depends on: semua modul di atas
 */
// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    ui.initLogo();
    ui.initIcons();
    initEvents();

    updateCategoryNavTop();
    const _resizeObserver = new ResizeObserver(() => updateCategoryNavTop());
    const _navEl          = document.querySelector('nav');
    const _searchEl       = document.getElementById('mobile-search-bar');
    if (_navEl)    _resizeObserver.observe(_navEl);
    if (_searchEl) _resizeObserver.observe(_searchEl);

    const creditsPromise   = api.fetchCreditBalance();
    const comitbasePromise = api.fetchComitbaseImages();
    const dtreasurePromise = api.fetchDtreasureImages();

    const imagesOk = await api.fetchImages();
    if (imagesOk) {
        ui.changeCategory('All', { scroll: false });
    }

    await Promise.allSettled([creditsPromise, comitbasePromise, dtreasurePromise]);
    if (state.currentCategory === 'COMITBASE') ui.renderComitbaseGallery();
    if (state.currentCategory === 'DTREASURE') ui.renderDtreasureGallery();

    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        nav?.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });

    const rankingCarousel = document.getElementById('ranking-carousel');
    document.getElementById('carousel-scroll-left')?.addEventListener('click', () => {
        rankingCarousel?.scrollBy({ left: -420, behavior: 'smooth' });
    });
    document.getElementById('carousel-scroll-right')?.addEventListener('click', () => {
        rankingCarousel?.scrollBy({ left: 420, behavior: 'smooth' });
    });

    if (rankingCarousel) {
        let isDragging   = false;
        let hasDragged   = false;
        let startX       = 0;
        let scrollLeftAt = 0;

        rankingCarousel.addEventListener('mousedown', (e) => {
            isDragging   = true;
            hasDragged   = false;
            startX       = e.pageX - rankingCarousel.offsetLeft;
            scrollLeftAt = rankingCarousel.scrollLeft;
            rankingCarousel.style.userSelect = 'none';
            delete rankingCarousel.dataset.justDragged;
        });

        const stopDrag = () => {
            if (isDragging && hasDragged) {
                rankingCarousel.dataset.justDragged = '1';
                setTimeout(() => { delete rankingCarousel.dataset.justDragged; }, 50);
            }
            isDragging = false;
            rankingCarousel.style.removeProperty('user-select');
        };
        rankingCarousel.addEventListener('mouseleave', stopDrag);
        rankingCarousel.addEventListener('mouseup',    stopDrag);
        rankingCarousel.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const delta = (e.pageX - rankingCarousel.offsetLeft) - startX;
            if (Math.abs(delta) > 6) hasDragged = true;
            e.preventDefault();
            rankingCarousel.scrollLeft = scrollLeftAt - delta * 1.5;
        });
    }
});