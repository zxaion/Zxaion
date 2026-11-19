/**
 * events/pagination.js — Paginasi galeri/COMITBASE/DTREASURE + tombol COMIT HERE.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initPaginationEvents() {
    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (state.currentPage > 1) { state.currentPage--; ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
        const total = Math.ceil(state.filteredPhotos.length / ITEMS_PER_PAGE);
        if (state.currentPage < total) { state.currentPage++; ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // COMITBASE pagination
    document.getElementById('comitbase-prev')?.addEventListener('click', () => {
        if (state.currentComitbasePage > 1) { state.currentComitbasePage--; ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('comitbase-next')?.addEventListener('click', () => {
        const total = Math.ceil(state.comitbasePhotos.length / ITEMS_PER_PAGE);
        if (state.currentComitbasePage < total) { state.currentComitbasePage++; ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // DTREASURE pagination
    document.getElementById('dtreasure-prev')?.addEventListener('click', () => {
        if (state.currentDtreasurePage > 1) { state.currentDtreasurePage--; ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('dtreasure-next')?.addEventListener('click', () => {
        const total = Math.ceil(state.dtreasurePhotos.length / ITEMS_PER_PAGE);
        if (state.currentDtreasurePage < total) { state.currentDtreasurePage++; ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // COMIT HERE
    document.getElementById('comit-here-btn')?.addEventListener('click', () => {
        const subject = 'COMITBASE Submission - Visual Composition';
        const body    = `Title:\nArtist Name:\nPlatform Name:\nArt Desc (optional):\nVisual Link: (Google Drive only)\n\n---\nSubmitted via ZXAION VERSE COMITBASE`;
        window.open(`mailto:zxaionxl@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    });
}
