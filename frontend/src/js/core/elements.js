/**
 * core/elements.js — Cache referensi elemen DOM utama.
 * Depends on: DOM sudah ter-parse (script di-load di akhir <body>)
 */
// --- DOM Elements ---
const elements = {
    galleryContainer:      document.getElementById('gallery-container'),
    animeCollections:      document.getElementById('anime-collections'),
    animeGrid:             document.getElementById('anime-grid'),
    comitbaseSection:      document.getElementById('comitbase-section'),
    comitbaseGallery:      document.getElementById('comitbase-gallery'),
    dtreasureSection:      document.getElementById('dtreasure-section'),
    dtreasureGallery:      document.getElementById('dtreasure-gallery'),
    paginationContainer:   document.getElementById('pagination-container'),
    comitbasePagination:   document.getElementById('comitbase-pagination'),
    dtreasurePagination:   document.getElementById('dtreasure-pagination'),
    searchInput:           document.getElementById('searchInput'),
    searchInputMobile:     document.getElementById('searchInputMobile'),
    searchClear:           document.getElementById('search-clear'),
    imageModal:            document.getElementById('image-modal'),
    modalImg:              document.getElementById('modal-img'),
    modalTitle:            document.getElementById('modal-title'),
    modalCategory:         document.getElementById('modal-category'),
    modalViewCount:        document.getElementById('modal-view-count'),
    modalDownloadCount:    document.getElementById('modal-download-count'),
    downloadBtn:           document.getElementById('download-btn'),
    originalCount:         document.getElementById('original-count'),
    creditBalance:         document.getElementById('credit-balance'),
    paypalButtonContainer: document.getElementById('paypal-button-container'),
    paypalButtons:         document.getElementById('paypal-buttons'),
};
