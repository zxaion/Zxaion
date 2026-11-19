/**
 * core/state.js — State aplikasi (class AppState + instance state) dan timer carousel.
 * Depends on: (tidak ada)
 */
// --- State Management ---
class AppState {
    constructor() {
        this.currentCategory    = 'All';
        this.currentAnimeAlbum  = null;
        this.currentPage        = 1;
        this.currentComitbasePage  = 1;
        this.currentDtreasurePage  = 1;
        this.allPhotos          = [];
        this.comitbasePhotos    = [];
        this.dtreasurePhotos    = [];
        this.animeAlbums        = {};
        this.filteredPhotos     = [];
        this.currentImageId     = null;
        this.credits            = 0;
        this.lifetime           = false;
        this.purchasedImages    = new Set();
        this.searchQuery        = '';
        this.selectedCreditPack = null;
    }

    resetPagination() {
        this.currentPage          = 1;
        this.currentComitbasePage = 1;
        this.currentDtreasurePage = 1;
    }
}

const state = new AppState();

// Timer untuk auto-refresh ranking carousel — dibersihkan saat ganti kategori.
let _carouselRefreshTimer = null;
