// frontend/js/ui/pagination.js
// UI paginasi untuk semua galeri
import { ITEMS_PER_PAGE } from '../config/constants.js';
import { state } from '../state/appState.js';
import { elements } from './elements.js';
import { ui } from './index.js';

Object.assign(ui, {
    updatePagination() {
        if (!elements.paginationContainer) return;
        const totalPages = Math.ceil(state.filteredPhotos.length / ITEMS_PER_PAGE);
        if (totalPages > 1) {
            elements.paginationContainer.classList.remove('hidden');
            const pageInfo = document.getElementById('page-info');
            if (pageInfo) pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
            const prevBtn = document.getElementById('prev-page');
            const nextBtn = document.getElementById('next-page');
            if (prevBtn) prevBtn.disabled = state.currentPage === 1;
            if (nextBtn) nextBtn.disabled = state.currentPage === totalPages;
        } else {
            elements.paginationContainer.classList.add('hidden');
        }
    },

    updateComitbasePagination() {
        if (!elements.comitbasePagination) return;
        const totalPages = Math.ceil(state.comitbasePhotos.length / ITEMS_PER_PAGE);
        if (totalPages > 1) {
            elements.comitbasePagination.classList.remove('hidden');
            const pageInfo = document.getElementById('comitbase-page-info');
            if (pageInfo) pageInfo.textContent = `Page ${state.currentComitbasePage} of ${totalPages}`;
            const prevBtn = document.getElementById('comitbase-prev');
            const nextBtn = document.getElementById('comitbase-next');
            if (prevBtn) prevBtn.disabled = state.currentComitbasePage === 1;
            if (nextBtn) nextBtn.disabled = state.currentComitbasePage === totalPages;
        } else {
            elements.comitbasePagination.classList.add('hidden');
        }
    },

    updateDtreasurePagination() {
        if (!elements.dtreasurePagination) return;
        const totalPages = Math.ceil(state.dtreasurePhotos.length / ITEMS_PER_PAGE);
        if (totalPages <= 1) {
            elements.dtreasurePagination.classList.add('hidden');
            return;
        }
        elements.dtreasurePagination.classList.remove('hidden');
        const pageInfo = document.getElementById('dtreasure-page-info');
        if (pageInfo) pageInfo.textContent = `Page ${state.currentDtreasurePage} of ${totalPages}`;
        const prevBtn = document.getElementById('dtreasure-prev');
        const nextBtn = document.getElementById('dtreasure-next');
        if (prevBtn) prevBtn.disabled = state.currentDtreasurePage === 1;
        if (nextBtn) nextBtn.disabled = state.currentDtreasurePage >= totalPages;
    },
});
