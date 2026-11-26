/**
 * events/pagination.js — Paginasi, Infinite Scroll/Load More, Sort & Filter Rasio, Tab DTREASURE Library + COMIT HERE.
 * Depends on: state, elements, ui, utils, api, galleryFilters, ITEMS_PER_PAGE
 */
function initPaginationEvents() {
    const rerenderActiveSection = () => {
        if (state.currentCategory === 'COMITBASE') {
            ui.renderComitbaseGallery();
        } else if (state.currentCategory === 'DTREASURE') {
            ui.renderDtreasureGallery();
        } else {
            ui.renderGallery();
        }
    };

    const setBrowseMode = (mode) => {
        state.browseMode = mode === 'infinite' ? 'infinite' : 'pagination';
        try { localStorage.setItem('zxaion_browse_mode', state.browseMode); } catch (_) {}
        state.resetPagination();
        if (typeof saveViewState === 'function') saveViewState();
        ui.syncToolbarUI();
        rerenderActiveSection();
    };

    // Main Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (state.currentPage > 1) { state.currentPage--; saveViewState?.(); ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
        const total = Math.ceil(ui.getMainDisplayPhotos().length / ITEMS_PER_PAGE);
        if (state.currentPage < total) { state.currentPage++; saveViewState?.(); ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('gallery-load-more-btn')?.addEventListener('click', () => ui.loadMoreGallery());

    // COMITBASE pagination & Load More
    document.getElementById('comitbase-prev')?.addEventListener('click', () => {
        if (state.currentComitbasePage > 1) { state.currentComitbasePage--; saveViewState?.(); ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('comitbase-next')?.addEventListener('click', () => {
        const total = Math.ceil(ui.getComitbaseDisplayPhotos().length / ITEMS_PER_PAGE);
        if (state.currentComitbasePage < total) { state.currentComitbasePage++; saveViewState?.(); ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('comitbase-load-more-btn')?.addEventListener('click', () => ui.loadMoreComitbase());

    // DTREASURE pagination & Load More
    document.getElementById('dtreasure-prev')?.addEventListener('click', () => {
        if (state.currentDtreasurePage > 1) { state.currentDtreasurePage--; saveViewState?.(); ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('dtreasure-next')?.addEventListener('click', () => {
        const total = Math.ceil(ui.getDtreasureDisplayPhotos().length / ITEMS_PER_PAGE);
        if (state.currentDtreasurePage < total) { state.currentDtreasurePage++; saveViewState?.(); ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('dtreasure-load-more-btn')?.addEventListener('click', () => ui.loadMoreDtreasure());

    // Sort Buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sort = btn.dataset.sort || 'latest';
            state.sortBy = sort;
            state.resetPagination();
            saveViewState?.();
            ui.invalidateMainSortCache();
            ui.invalidateComitbaseSortCache();
            ui.invalidateDtreasureSortCache();
            ui.syncToolbarUI();
            rerenderActiveSection();
        });
    });

    // Aspect Ratio Filter Buttons
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.aspectFilter = btn.dataset.ratio || 'all';
            state.resetPagination();
            saveViewState?.();
            ui.syncToolbarUI();
            rerenderActiveSection();
        });
    });

    // Browse Mode Toggle (Toolbar button + Footer switch pills)
    document.getElementById('browse-mode-toggle')?.addEventListener('click', () => {
        setBrowseMode(state.browseMode === 'infinite' ? 'pagination' : 'infinite');
    });
    document.querySelectorAll('[data-switch-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            setBrowseMode(btn.dataset.switchMode);
        });
    });

    // DTREASURE Tabs (All Vault vs My Unlocked / Library)
    document.querySelectorAll('.dtreasure-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.dtreasureTab = btn.dataset.dtreasureTab === 'library' ? 'library' : 'all';
            state.currentDtreasurePage = 1;
            saveViewState?.();
            ui.invalidateDtreasureSortCache();
            ui.renderDtreasureGallery();
        });
    });

    // COMIT HERE
    document.getElementById('comit-here-btn')?.addEventListener('click', () => {
        const subject = 'COMITBASE Submission - Visual Composition';
        const body    = `Title:\nArtist Name:\nPlatform Name:\nArt Desc (optional):\nVisual Link: (Google Drive only)\n\n---\nSubmitted via ZXAION VERSE COMITBASE`;
        window.open(`mailto:zxaionxl@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    });
}
