/**
 * ui/base.js — Membuat objek `ui` + empty state / no-results / jumlah album ORIGINAL.
 * Depends on: elements
 */
// --- UI Functions ---
const ui = {
    updateOriginalAlbumCount() {
        const originalAlbum = state.animeAlbums['ORIGINAL'];
        const count = originalAlbum ? originalAlbum.photos.length : 0;
        if (elements.originalCount) elements.originalCount.textContent = count.toLocaleString();
    },

    showEmptyState() {
        document.getElementById('empty-state')?.classList.remove('hidden');
    },

    hideEmptyState() {
        document.getElementById('empty-state')?.classList.add('hidden');
    },

    showNoResults() {
        document.getElementById('no-results')?.classList.remove('hidden');
    },

    hideNoResults() {
        document.getElementById('no-results')?.classList.add('hidden');
    },
};
