/**
 * app/init.js — Titik masuk aplikasi: DOMContentLoaded → init + fetch data + carousel scroll.
 * Depends on: semua modul di atas
 */
// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    ui.initLogo();
    ui.initCategoryAndHeaderImages();
    ui.initIcons();
    initEvents();

    updateCategoryNavTop();
    const _resizeObserver = new ResizeObserver(() => updateCategoryNavTop());
    const _navEl          = document.querySelector('nav');
    if (_navEl)    _resizeObserver.observe(_navEl);

    const isAdminRoute = window.location.pathname === '/admin' || window.location.hash === '#admin';
    const initialView  = !isAdminRoute && typeof loadInitialViewState === 'function'
        ? loadInitialViewState()
        : { category: 'All', animeAlbum: null, dtreasureTab: 'all', page: 1, comitbasePage: 1, dtreasurePage: 1, aspectFilter: 'all' };

    state.dtreasureTab         = initialView.dtreasureTab;
    state.aspectFilter         = initialView.aspectFilter;
    state.currentPage          = initialView.page;
    state.currentComitbasePage = initialView.comitbasePage;
    state.currentDtreasurePage = initialView.dtreasurePage;

    const autoAccountPromise = api.ensureAutoAccount?.();
    const creditsPromise     = api.fetchCreditBalance();
    const comitbasePromise   = api.fetchComitbaseImages();
    const dtreasurePromise   = api.fetchDtreasureImages();
    const mainPromise        = api.fetchImages();

    let initialBucketSig = null;

    if (isAdminRoute) {
        ui.openAdminSection();
    } else if (initialView.category === 'DTREASURE') {
        ui.changeCategory('DTREASURE', { scroll: false, preservePage: true, persist: false });
        const dtNeedsCredits = initialView.dtreasureTab === 'library';
        const [dtOk] = await Promise.all([
            dtreasurePromise,
            dtNeedsCredits ? creditsPromise : Promise.resolve(),
        ]);
        if (dtOk && state.currentCategory === 'DTREASURE') {
            ui.invalidateDtreasureSortCache?.();
            ui.renderDtreasureGallery();
            initialBucketSig = `DTREASURE:${state.dtreasurePhotos.length}:${state.lifetime ? 1 : 0}:${state.purchasedImages.size}`;
            ui.checkDeepLink();
        }
    } else if (initialView.category === 'COMITBASE') {
        ui.changeCategory('COMITBASE', { scroll: false, preservePage: true, persist: false });
        const cbOk = await comitbasePromise;
        if (cbOk && state.currentCategory === 'COMITBASE') {
            ui.invalidateComitbaseSortCache?.();
            ui.renderComitbaseGallery();
            initialBucketSig = `COMITBASE:${state.comitbasePhotos.length}`;
            ui.checkDeepLink();
        }
    } else if (initialView.category === 'Anime' && initialView.animeAlbum) {
        ui.changeCategory('Anime', { scroll: false, preservePage: true, persist: false });
        await ui.openAnimeAlbum(initialView.animeAlbum, { page: initialView.page, scroll: false, persist: false });
        const imagesOk = await mainPromise;
        if (imagesOk && state.currentCategory === 'Anime' && state.currentAnimeAlbum === initialView.animeAlbum) {
            ui.checkDeepLink();
        }
    } else {
        // Immediately reflect active category chrome while catalog loads
        if (initialView.category !== 'All') {
            ui.changeCategory(initialView.category, { scroll: false, preservePage: true, persist: false });
        }
        const imagesOk = await mainPromise;
        if (imagesOk) {
            if (initialView.category === 'All') {
                ui.changeCategory('All', { scroll: false, preservePage: true, persist: false });
            } else if (state.currentCategory === initialView.category) {
                ui.changeCategory(initialView.category, { scroll: false, preservePage: true, persist: false });
            }
            ui.checkDeepLink();
        }
    }

    await Promise.allSettled([autoAccountPromise, creditsPromise, comitbasePromise, dtreasurePromise, mainPromise]);
    if (!isAdminRoute) {
        if (state.currentCategory === 'COMITBASE') {
            const nextSig = `COMITBASE:${state.comitbasePhotos.length}`;
            if (nextSig !== initialBucketSig || !elements.comitbaseGallery?.children?.length) {
                ui.invalidateComitbaseSortCache?.();
                ui.renderComitbaseGallery();
            }
        } else if (state.currentCategory === 'DTREASURE') {
            const nextSig = `DTREASURE:${state.dtreasurePhotos.length}:${state.lifetime ? 1 : 0}:${state.purchasedImages.size}`;
            if (nextSig !== initialBucketSig || !elements.dtreasureGallery?.children?.length) {
                ui.invalidateDtreasureSortCache?.();
                ui.renderDtreasureGallery();
            }
        } else if (state.currentCategory === 'Anime' && !state.currentAnimeAlbum) {
            ui.renderAnimeCollections();
        }

        if (!state.currentImageId) {
            ui.checkDeepLink();
        } else if (state.currentPhoto && typeof ui.refreshModalLockState === 'function') {
            ui.refreshModalLockState(state.currentPhoto);
        }
    }

    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        nav?.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });

    const rankingCarousel = document.getElementById('ranking-carousel');
    document.getElementById('ranking-mode-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-carousel-mode]');
        if (btn && btn.dataset.carouselMode) {
            ui.renderTopRankingCarousel?.(btn.dataset.carouselMode);
        }
    });
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
            rankingCarousel.style.scrollBehavior = 'auto';
            rankingCarousel.style.userSelect = 'none';
            delete rankingCarousel.dataset.justDragged;
        });

        const stopDrag = () => {
            if (isDragging && hasDragged) {
                rankingCarousel.dataset.justDragged = '1';
                setTimeout(() => { delete rankingCarousel.dataset.justDragged; }, 50);
            }
            isDragging = false;
            rankingCarousel.style.removeProperty('scroll-behavior');
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
