/**
 * ui/carousel.js — Carousel Top Ranking (trending) di Home.
 * Depends on: ui (base.js), state, api, utils
 */
Object.assign(ui, {
    // FIX: Satu shared IntersectionObserver untuk semua kartu — O(1) vs O(N)
    async renderTopRankingCarousel(modeOverride = null) {
        const carousel = document.getElementById('ranking-carousel');
        if (!carousel) return;

        const mode = modeOverride || state.carouselMode || 'trending';
        state.carouselMode = mode;

        const headingEl = document.getElementById('ranking-carousel-heading');
        const subtitleEl = document.getElementById('ranking-carousel-subtitle');
        const headings = {
            trending:   { title: 'Top 20 Trending',        sub: 'Auto-updated · Most Viewed & Downloaded' },
            creators:   { title: 'Weekly Top Creators',    sub: 'Verified COMITBASE Artists · Ranked by Community Engagement' },
            loved:      { title: 'Top 20 Most Loved',      sub: 'Community Favorites · Ranked by Hearts' },
            downloaded: { title: 'Top 20 Most Downloaded', sub: 'Popular Picks · Ranked by Downloads' },
        };
        const meta = headings[mode] || headings.trending;
        if (headingEl) headingEl.textContent = meta.title;
        if (subtitleEl) subtitleEl.textContent = meta.sub;

        document.querySelectorAll('#ranking-mode-tabs .ranking-mode-btn').forEach((btn) => {
            const active = btn.dataset.carouselMode === mode;
            btn.classList.toggle('active', active);
            btn.classList.toggle('bg-amber-500', active);
            btn.classList.toggle('text-gray-950', active);
            btn.classList.toggle('text-gray-300', !active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        carousel.innerHTML = Array.from({ length: 6 }, () =>
            '<div class="flex-none rounded-2xl overflow-hidden bg-gray-800 ranking-card-skeleton" style="min-width:144px;width:144px;aspect-ratio:9/16;"></div>'
        ).join('');

        const items = await api.fetchTrendingImages(20, mode);

        if (!items || items.length === 0) {
            carousel.innerHTML =
                '<div class="flex items-center justify-center w-full py-6">' +
                '<p class="text-gray-400 text-sm">No leaderboard data yet — start exploring!</p>' +
                '</div>';
            return;
        }

        carousel.innerHTML = '';
        const fragment = document.createDocumentFragment();

        const sharedObserver = 'IntersectionObserver' in window
            ? new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            delete img.dataset.src;
                        }
                        observer.unobserve(img);
                    }
                });
            }, { root: carousel, rootMargin: '200px' })
            : null;

        if (mode === 'creators') {
            items.forEach((creator, index) => {
                const rankColors = ['from-amber-400 to-yellow-500', 'from-gray-300 to-gray-400', 'from-amber-700 to-amber-800'];
                const rankColor  = index < 3 ? rankColors[index] : 'from-teal-700 to-emerald-800';
                const rankLabel  = index < 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][index] : `#${index + 1}`;
                const isMedal    = index < 3;
                const rawCover   = creator.coverUrl || creator.sampleUrl || creator.samplePhotos?.[0]?.url || '';
                const coverUrl   = rawCover
                    ? (utils.getImageFallbackCandidates(rawCover, { w: 400, q: 80, fit: 'scale-down', fmt: 'auto' })[0] || rawCover)
                    : '';
                const safeName   = utils.escapeHtml(creator.profileName || 'Creator');
                const safeDesc   = utils.escapeHtml(creator.description || 'Verified COMITBASE Creator');
                const artworks   = creator.artworkCount ?? creator.uploadCount ?? 0;
                const loves      = creator.totalLoves ?? creator.loveCount ?? 0;
                const fires      = creator.totalFires ?? creator.fireCount ?? 0;
                const downloads  = creator.totalDownloads ?? creator.downloadCount ?? 0;

                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'ranking-card flex-none text-left cursor-pointer group relative rounded-2xl overflow-hidden shadow-lg ring-1 ring-teal-500/30 bg-gray-900 hover:ring-teal-400 transition-all';
                card.style.cssText = 'min-width:220px;width:220px;';
                card.setAttribute('aria-label', `Open creator profile ${creator.profileName || ''}`);

                card.innerHTML =
                    '<div class="relative h-28 w-full bg-gradient-to-br from-teal-900 via-gray-900 to-emerald-950 overflow-hidden">' +
                        (coverUrl ? '<img src="' + utils.escapeHtml(coverUrl) + '" alt="' + safeName + '" class="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async">' : '') +
                        '<div class="absolute inset-0 bg-gradient-to-t from-gray-950 via-black/30 to-transparent"></div>' +
                        '<div class="absolute top-2 left-2 bg-gradient-to-br ' + rankColor + ' rounded-full w-7 h-7 flex items-center justify-center shadow-lg ' + (isMedal ? 'text-sm' : 'text-white text-[11px] font-black') + '">' + rankLabel + '</div>' +
                        '<span class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-teal-500/90 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1"><i class="fas fa-certificate"></i> Verified</span>' +
                    '</div>' +
                    '<div class="p-3 space-y-1.5">' +
                        '<div class="text-white text-xs font-black truncate">' + safeName + '</div>' +
                        '<p class="text-gray-400 text-[10px] leading-snug line-clamp-2 min-h-[28px]">' + safeDesc + '</p>' +
                        '<div class="flex items-center justify-between pt-1 text-[10px] text-gray-300 border-t border-white/10">' +
                            '<span><i class="fas fa-images text-teal-400 mr-1"></i>' + utils.formatNumber(artworks) + '</span>' +
                            '<span><i class="fas fa-heart text-rose-400 mr-1"></i>' + utils.formatNumber(loves) + '</span>' +
                            '<span><i class="fas fa-fire text-amber-400 mr-1"></i>' + utils.formatNumber(fires) + '</span>' +
                            '<span><i class="fas fa-download text-sky-400 mr-1"></i>' + utils.formatNumber(downloads) + '</span>' +
                        '</div>' +
                    '</div>';

                card.addEventListener('click', () => {
                    if (carousel.dataset.justDragged) return;
                    if (creator.slug) {
                        ui.changeCategory('COMITBASE', { creatorSlug: creator.slug });
                    }
                });
                fragment.appendChild(card);
            });
            carousel.appendChild(fragment);
            return;
        }

        items.forEach((photo, index) => {
            const candidates = utils.getImageFallbackCandidates(photo.url, { w: 400, q: 80, fit: 'scale-down', fmt: 'auto' });
            const fullUrl    = candidates[0] || '';
            const rankColors = ['from-amber-400 to-yellow-500', 'from-gray-300 to-gray-400', 'from-amber-700 to-amber-800'];
            const rankColor  = index < 3 ? rankColors[index] : 'from-gray-700 to-gray-800';
            const rankLabel  = index < 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][index] : `#${index + 1}`;
            const isMedal    = index < 3;
            const score      = mode === 'loved'
                ? (photo.loveCount || 0)
                : (mode === 'downloaded' ? (photo.downloadCount || 0) : ((photo.viewCount || 0) + (photo.downloadCount || 0)));
            const badgeIcon  = mode === 'loved'
                ? 'fa-heart text-rose-400'
                : (mode === 'downloaded' ? 'fa-download text-sky-400' : 'fa-fire text-amber-400');
            const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='256'%3E%3Crect fill='%23222' width='144' height='256'/%3E%3C/svg%3E";
            const isVisibleCard = index < 5;
            const loadingAttr   = isVisibleCard ? 'eager' : 'lazy';
            const fetchPrio     = index < 3 ? ' fetchpriority="high"' : '';
            const srcAttr       = isVisibleCard
                ? 'src="' + utils.escapeHtml(fullUrl || placeholder) + '"'
                : 'src="' + placeholder + '" data-src="' + utils.escapeHtml(fullUrl) + '"';

            const card = document.createElement('div');
            card.className = 'ranking-card flex-none cursor-pointer group relative rounded-2xl overflow-hidden shadow-lg ring-1 ring-white/10 bg-gray-900';
            card.style.cssText = 'min-width:144px;width:144px;';

            card.innerHTML =
                '<div class="relative w-full" style="aspect-ratio:9/16;">' +
                    '<img ' + srcAttr + ' alt="' + utils.escapeHtml(photo.title) + '" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300 ranking-lazy-img" loading="' + loadingAttr + '"' + fetchPrio + ' decoding="async" draggable="false">' +
                    '<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent pointer-events-none"></div>' +
                    '<div class="absolute top-2 left-2 bg-gradient-to-br ' + rankColor + ' rounded-full w-8 h-8 flex items-center justify-center shadow-lg ' + (isMedal ? 'text-base' : 'text-white text-xs font-black') + '">' + rankLabel + '</div>' +
                    '<div class="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-1">' +
                        '<i class="fas ' + badgeIcon + '" style="font-size:8px;"></i>' +
                        '<span class="text-white text-[10px] font-bold">' + utils.formatNumber(score) + '</span>' +
                    '</div>' +
                    '<div class="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">' +
                        '<p class="text-white text-[11px] font-bold leading-tight" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + utils.escapeHtml(photo.title || 'Wallpaper') + '</p>' +
                        '<div class="flex items-center gap-1.5 mt-1.5">' +
                            '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-eye text-green-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.viewCount || 0) + '</span>' +
                            '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-heart text-rose-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.loveCount || 0) + '</span>' +
                            '<span class="flex items-center gap-0.5 text-gray-300 text-[9px]"><i class="fas fa-fire text-amber-400" style="font-size:8px;"></i> ' + utils.formatNumber(photo.fireCount || 0) + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            const img = card.querySelector('img.ranking-lazy-img');
            if (img) {
                utils.attachImageFallback(img, candidates, {
                    onFinalError(el) { el.style.opacity = '0.2'; },
                });
                if (!isVisibleCard) {
                    if (sharedObserver) sharedObserver.observe(img);
                    else if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
                }
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
