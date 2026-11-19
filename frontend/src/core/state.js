/**
 * Shared UI state for the gallery application.
 * Field names and defaults are kept identical to the original AppState.
 */
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
    }

    resetPagination() {
        this.currentPage          = 1;
        this.currentComitbasePage = 1;
        this.currentDtreasurePage = 1;
    }
}

export const state = new AppState();
