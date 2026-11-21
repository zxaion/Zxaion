/**
 * ui/carousel.js — Carousel Top Ranking (trending) di Home.
 * Depends on: ui (base.js), state, api, utils
 */
Object.assign(ui, {
    // FIX: Satu shared IntersectionObserver untuk semua kartu — O(1) vs O(N)
    async renderTopRankingCarousel() {
        const carousel = document.getElementById('ranking-carousel');
        if (!carousel) return;

        carousel.innerHTML = Array.from({ length: 6 }, () =>
            '<div class="flex-none rounded-2xl overflow-hidden bg-gray-800 ranking-card-skeleton" style="min-width:144px;width:144px;aspect-ratio:9/16;"></div>'
        ).join('');

        const photos = await api.fetchTrendingImages(20);

        if (!photos || photos.length === 0) {
            carousel.innerHTML =
                '<div class="flex items-center justify-center w-full py-6">' +
                '<p class="text-gray-500 text-sm">No trending data yet — start exploring!</p>' +
                '</div>';
            return;
        }

        carousel.innerHTML = '';
        const fragment = document.createDocumentFragment();

        // Satu shared observer untuk semua kartu — cegah N observer instances
        const sharedObserver = 'IntersectionObserver' in window
            ? new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src         = img.dataset.src;
                            delete img.dataset.src;
                            img.onerror = () => { img.style.opacity = '0.2'; };
                        }
                        observer.unobserve(img);
                    }
                });
            }, { root: carousel, rootMargin: '200px' })
            : null;

        photos.forEach((photo, index) => {
            const fullUrl    = utils.buildImageUrl(photo.url, { w: 360, h: 640, q: 80, fit: 'cover', fmt: 'auto' });
            const rankColors = ['from-amber-400 to-yellow-500', 'from-gray-300 to-gray-400', 'from-amber-700 to-amber-800'];
            const rankColor  = index < 3 ? rankColors[index] : 'from-gray-700 to-gray-800';
            const rankLabel  = index < 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][index] : `#${index + 1}`;
            const isMedal    = index < 3;
            const score      = (photo.viewCount || 0) + (photo.downloadCount || 0);
            const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='256'%3E%3Crect fill='%23222' width='144' height='256'/%3E%3C/svg%3E";

            const card = document.createElement('div');
            card.className = 'ranking-card flex-none cursor-pointer group relative rounded-2xl overflow-hidden shadow-lg ring-1 ring-white/10 bg-gray-900';
            card.style.cssText = 'min-width:144px;width:144px;';

            card.innerHTML =
                '<div class="relative w-full" style="aspect-ratio:9/16;">' +
                    '<img src="' + placeholder + '" data-src="' + fullUrl + '" alt="' + utils.escapeHtml(photo.title) + '" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300 ranking-lazy-img" loading="lazy" decoding="async" draggable="false">' +
                    '<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent pointer-events-none"></div>' +
                    '<div class="absolute top-2 left-2 bg-gradient-to-br ' + rankColor + ' rounded-full w-8 h-8 flex items-center justify-center shadow-lg ' + (isMedal ? 'text-base' : 'text-white text-xs font-black') + '">' + rankLabel + '</div>' +
                    '<div class="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-1">' +
                        '<i class="fas fa-fire text-amber-400" style="font-size:8px;"></i>' +
                        '<span class="text-white text-[10px] font-bold">' + utils.formatNumber(score) + '</span>' +
                    '</div>' +
                    '<div class="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">' +
                        '<p class="text-white text-[11px] font-bold leading-tight" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + utils.escapeHtml(photo.title || 'Wallpaper') + '</p>' +
                        '<div class="flex items-center gap-2 mt-1.5">' +
                            '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-eye text-green-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.viewCount || 0) + '</span>' +
                            '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-download text-blue-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.downloadCount || 0) + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            const img = card.querySelector('img.ranking-lazy-img');
            if (img) {
                if (sharedObserver) sharedObserver.observe(img);
                else if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
            }

            card.addEventListener('click', () => {
                if (carousel.dataset.justDragged) return;
                ui.openImageModal(photo);
            });
            fragment.appendChild(card);
        });

        carousel.appendChild(fragment);
    },
});
