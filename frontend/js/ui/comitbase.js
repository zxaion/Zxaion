// frontend/js/ui/comitbase.js
// UI galeri COMITBASE
import { API_BASE, ITEMS_PER_PAGE } from '../config/constants.js';
import { state } from '../state/appState.js';
import { elements } from './elements.js';
import { ui } from './index.js';
import { utils } from '../utils/helpers.js';

Object.assign(ui, {
    renderComitbaseGallery() {
        if (!elements.comitbaseGallery) return;

        if (state.comitbasePhotos.length === 0) {
            elements.comitbaseGallery.innerHTML = `
            <div class="col-span-full text-center py-20">
                <div class="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center dark:bg-gray-700">
                    <i class="fas fa-images text-3xl text-gray-400"></i>
                </div>
                <p class="text-gray-500 dark:text-gray-400">No COMITBASE images yet</p>
            </div>`;
            if (elements.comitbasePagination) elements.comitbasePagination.classList.add('hidden');
            return;
        }

        const start        = (state.currentComitbasePage - 1) * ITEMS_PER_PAGE;
        const end          = start + ITEMS_PER_PAGE;
        const photosToShow = state.comitbasePhotos.slice(start, end);

        elements.comitbaseGallery.innerHTML = '';

        if (this._comitbaseObserver) this._comitbaseObserver.disconnect();
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '50px' });
        this._comitbaseObserver = imageObserver;

        // DocumentFragment — satu reflow saat append
        const fragment       = document.createDocumentFragment();
        const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E';

        photosToShow.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'masonry-item fade-in';
            item.style.animationDelay = `${index * 50}ms`;
            item.dataset.photoId = photo.id;

            const fullUrl       = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
            const viewCount     = utils.formatNumber(photo.viewCount     || 0);
            const downloadCount = utils.formatNumber(photo.downloadCount || 0);

            item.innerHTML = `
            <img
                src="${placeholderSvg}"
                data-src="${fullUrl}"
                alt="${utils.escapeHtml(photo.title)}"
                loading="lazy"
                class="loading-shimmer w-full h-auto"
                decoding="async">
            <div class="masonry-overlay">
                <div class="stats">
                    <span><i class="fas fa-eye"></i> <span class="view-count" data-id="${photo.id}">${viewCount}</span></span>
                    <span><i class="fas fa-download"></i> <span class="download-count" data-id="${photo.id}">${downloadCount}</span></span>
                </div>
                <button class="download-btn" type="button">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>`;

            const img   = item.querySelector('img');
            imageObserver.observe(img);
            img.onload  = function() { this.classList.remove('loading-shimmer'); };
            img.onerror = function() {
                this.classList.remove('loading-shimmer');
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';
            };
            fragment.appendChild(item);
        });

        elements.comitbaseGallery.appendChild(fragment);
        this.setupComitbaseEventListeners();
        this.updateComitbasePagination();
    },

    setupComitbaseEventListeners() {
        if (this.comitbaseClickHandler) {
            elements.comitbaseGallery.removeEventListener('click', this.comitbaseClickHandler);
        }
        const handleClick = (e) => {
            const downloadBtn = e.target.closest('.download-btn');
            if (downloadBtn) {
                e.stopPropagation();
                const item    = downloadBtn.closest('.masonry-item');
                const photoId = item.dataset.photoId;
                const photo   = state.comitbasePhotos.find(p => p.id === photoId);
                if (photo) ui.handleDownload(photo);
                return;
            }
            const item = e.target.closest('.masonry-item');
            if (item && !e.target.closest('.download-btn')) {
                const photoId = item.dataset.photoId;
                const photo   = state.comitbasePhotos.find(p => p.id === photoId);
                if (photo) ui.openImageModal(photo);
            }
        };
        this.comitbaseClickHandler = handleClick;
        elements.comitbaseGallery.addEventListener('click', handleClick);
    },
});
