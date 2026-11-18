// frontend/js/state/appState.js
// State aplikasi tunggal (satu sumber kebenaran)
export class AppState {
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
        this.carouselRefreshTimer = null;
        this.paypalButtonsInstance = null;
    }

    resetPagination() {
        this.currentPage          = 1;
        this.currentComitbasePage = 1;
        this.currentDtreasurePage = 1;
    }
}

export const state = new AppState();
