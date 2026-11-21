/**
 * app/globals.js — Fungsi global (window.*) yang dipanggil dari atribut onclick di HTML.
 * Depends on: ui, api, state
 */
// --- Global Functions ---
window.refreshImages = async () => {
    ui.hideEmptyState();
    const success = await api.fetchImages();
    if (success) ui.changeCategory(state.currentCategory);
};

window.changeCategory      = (category)    => ui.changeCategory(category);
window.openAnimeCollection = (albumTitle)  => ui.openAnimeAlbum(albumTitle);
window.resetAspectFilter   = () => {
    state.aspectFilter = 'all';
    state.resetPagination();
    ui.syncToolbarUI();
    if (state.currentCategory === 'COMITBASE') ui.renderComitbaseGallery();
    else if (state.currentCategory === 'DTREASURE') ui.renderDtreasureGallery();
    else ui.renderGallery();
};
window.switchDtreasureTab  = (tab) => {
    state.dtreasureTab = tab === 'library' ? 'library' : 'all';
    state.currentDtreasurePage = 1;
    ui.invalidateDtreasureSortCache();
    ui.renderDtreasureGallery();
};
