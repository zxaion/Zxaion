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

window.changeCategory    = (category)    => ui.changeCategory(category);
window.openAnimeCollection = (albumTitle) => ui.openAnimeAlbum(albumTitle);
