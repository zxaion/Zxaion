/**
 * ui/comitbase.js — Galeri COMITBASE: render, sort & filter rasio, event klik, paginasi & infinite scroll.
 * Depends on: ui (base.js), state, elements, utils, galleryFilters, ITEMS_PER_PAGE
 */
Object.assign(ui, {
    _safeExternalHttpUrl(raw) {
        const value = (raw && typeof raw === 'object') ? raw.url : raw;
        if (!value || typeof value !== 'string') return '';
        try {
            const parsed = new URL(value.trim());
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                return parsed.toString();
            }
        } catch (_) {}
        return '';
    },

    _socialLinkMeta(rawItem) {
        const href = this._safeExternalHttpUrl(rawItem);
        if (!href) return null;
        try {
            const host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
            let icon = 'fa-link';
            let label = (rawItem && typeof rawItem === 'object' && rawItem.label) ? String(rawItem.label) : host;
            if (host.includes('twitter') || host === 'x.com') {
                icon = 'fa-brands fa-x-twitter';
                label = 'X / Twitter';
            } else if (host.includes('instagram')) {
                icon = 'fa-brands fa-instagram';
                label = 'Instagram';
            } else if (host.includes('pixiv')) {
                icon = 'fa-palette';
                label = 'Pixiv';
            } else if (host.includes('deviantart')) {
                icon = 'fa-brands fa-deviantart';
                label = 'DeviantArt';
            } else if (host.includes('youtube')) {
                icon = 'fa-brands fa-youtube';
                label = 'YouTube';
            } else if (host.includes('tiktok')) {
                icon = 'fa-brands fa-tiktok';
                label = 'TikTok';
            } else if (host.includes('artstation')) {
                icon = 'fa-brands fa-artstation';
                label = 'ArtStation';
            }
            return { href, icon, label };
        } catch {
            return null;
        }
    },

    invalidateComitbaseSortCache() {
        this.invalidateSortCache('comitbase');
    },

    getComitbaseSortedPhotos() {
        const base = Array.isArray(state.comitbasePhotos) ? state.comitbasePhotos : [];
        const key = `${state.sortBy}:${base.length}:${base[0]?.id || ''}`;
        return this.getCachedSortedPhotos('comitbase', base, key);
    },

    getComitbaseDisplayPhotos() {
        return galleryFilters.filterPhotosByRatio(this.getComitbaseSortedPhotos(), state.aspectFilter, state.photoRatios);
    },

    _syncComitbaseCtaAndBanner() {
        const ctaBtnText = document.getElementById('comit-here-btn-text');
        const banner = document.getElementById('comitbase-my-status-banner');
        const mine = state.myCreatorProfile;

        if (ctaBtnText) {
            if (mine?.status === 'approved') ctaBtnText.textContent = 'My Creator Profile';
            else if (mine?.status === 'pending') ctaBtnText.textContent = 'Application Pending';
            else if (mine?.status === 'rejected') ctaBtnText.textContent = 'Reapply as Creator';
            else ctaBtnText.textContent = 'Apply as Creator';
        }

        if (!banner) return;
        if (!mine) {
            banner.classList.add('hidden');
            banner.innerHTML = '';
            return;
        }

        banner.classList.remove('hidden');
        if (mine.status === 'approved') {
            banner.className = 'flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-100 flex items-center justify-between gap-2';
            banner.innerHTML = `<span><i class="fas fa-circle-check mr-1.5 text-emerald-300"></i>Verified creator <strong>${utils.escapeHtml(mine.profileName)}</strong> is active.</span>`;
        } else if (mine.status === 'pending') {
            banner.className = 'flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-100';
            banner.innerHTML = `<i class="fas fa-hourglass-half mr-1.5 text-amber-300"></i>Your creator application for <strong>${utils.escapeHtml(mine.profileName)}</strong> is awaiting admin approval.`;
        } else {
            banner.className = 'flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-rose-400/30 bg-rose-500/15 text-rose-100';
            banner.innerHTML = `<i class="fas fa-circle-exclamation mr-1.5 text-rose-300"></i>Application not approved${mine.rejectionNote ? ': ' + utils.escapeHtml(mine.rejectionNote) : '. You can update & reapply.'}`;
        }
    },

    renderComitbaseDirectory() {
        const dirView = elements.comitbaseDirectoryView || document.getElementById('comitbase-directory-view');
        const profView = elements.comitbaseProfileView || document.getElementById('comitbase-profile-view');
        const grid = elements.comitbaseCreatorsGrid || document.getElementById('comitbase-creators-grid');
        const countBadge = document.getElementById('comitbase-creator-count-badge');

        if (dirView) dirView.classList.remove('hidden');
        if (profView) profView.classList.add('hidden');
        this.hideToolbar();
        this._syncComitbaseCtaAndBanner();

        if (!grid) return;
        const allCreators = Array.isArray(state.comitbaseCreators) ? state.comitbaseCreators : [];
        const q = String(state.comitbaseCreatorSearch || '').trim().toLowerCase();
        const filtered = q
            ? allCreators.filter(c =>
                (c.profileName && c.profileName.toLowerCase().includes(q)) ||
                (c.description && c.description.toLowerCase().includes(q)) ||
                (c.slug && c.slug.toLowerCase().includes(q))
            )
            : allCreators;

        if (countBadge) {
            countBadge.textContent = `${allCreators.length} Verified Creator${allCreators.length === 1 ? '' : 's'}`;
        }

        if (state.comitbaseCreatorsError && allCreators.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-16 bg-white/80 dark:bg-gray-900/70 rounded-3xl border border-gray-200 dark:border-gray-800">
                    <i class="fas fa-exclamation-triangle text-3xl text-red-500 mb-3"></i>
                    <p class="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Could not load verified creators.</p>
                    <button type="button" data-action="retry-comitbase" class="px-5 py-2 rounded-full bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 cursor-pointer">
                        <i class="fas fa-rotate mr-1"></i>Try Again
                    </button>
                </div>`;
            return;
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-16 bg-white/80 dark:bg-gray-900/70 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700">
                    <i class="fas fa-user-astronaut text-3xl text-teal-500 mb-3"></i>
                    <p class="text-sm font-bold text-gray-700 dark:text-gray-200">${q ? 'No creators match "' + utils.escapeHtml(state.comitbaseCreatorSearch) + '".' : 'No verified creators published yet.'}</p>
                </div>`;
            return;
        }

        grid.innerHTML = filtered.map((creator) => {
            const safeName = utils.escapeHtml(creator.profileName || 'Creator');
            const safeDesc = utils.escapeHtml(creator.description || '');
            const safeSlug = utils.escapeHtml(creator.slug || '');
            const initials = (creator.profileName || 'ZX').slice(0, 2).toUpperCase();
            const rawCover = creator.coverUrl || creator.sampleUrl || creator.samplePhotos?.[0]?.url || '';
            const coverUrl = rawCover
                ? (utils.getImageFallbackCandidates(rawCover, { w: 480, h: 270, q: 76, fit: 'cover', fmt: 'auto' })[0] || rawCover)
                : '';
            const artworks = creator.artworkCount ?? creator.uploadCount ?? 0;
            const loves = creator.totalLoves ?? creator.loveCount ?? 0;
            const fires = creator.totalFires ?? creator.fireCount ?? 0;
            const socialHtml = (Array.isArray(creator.socialLinks) ? creator.socialLinks : [])
                .slice(0, 2)
                .map((link) => {
                    const meta = this._socialLinkMeta(link);
                    if (!meta) return '';
                    return `<a href="${utils.escapeHtml(meta.href)}" target="_blank" rel="noopener noreferrer" data-social-link="1"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-teal-500 hover:text-white transition-colors">
                        <i class="${utils.escapeHtml(meta.icon)}" aria-hidden="true"></i>
                        <span>${utils.escapeHtml(meta.label)}</span>
                    </a>`;
                }).join('');

            return `
                <article data-creator-card="${safeSlug}" class="group rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-teal-500/60 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col">
                    <div class="relative h-40 bg-gradient-to-br from-gray-900 via-teal-950 to-emerald-950 overflow-hidden">
                        ${coverUrl ? `<img src="${utils.escapeHtml(coverUrl)}" alt="${safeName} cover" class="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async">` : ''}
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                        <span class="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-500/90 text-white text-[10px] font-black uppercase tracking-wider shadow">
                            <i class="fas fa-certificate" aria-hidden="true"></i> Verified
                        </span>
                        <div class="absolute bottom-3 left-4 right-4 flex items-center gap-3">
                            <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 text-gray-950 font-black text-sm flex items-center justify-center shadow-lg shrink-0">
                                ${utils.escapeHtml(initials)}
                            </div>
                            <div class="min-w-0">
                                <h3 class="text-base font-black text-white truncate">${safeName}</h3>
                                <div class="text-[11px] font-mono text-teal-200 truncate">@${safeSlug}</div>
                            </div>
                        </div>
                    </div>

                    <div class="p-5 flex-1 flex flex-col justify-between gap-4">
                        <div class="space-y-3">
                            <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">${safeDesc}</p>
                            ${socialHtml ? `<div class="flex flex-wrap gap-1.5">${socialHtml}</div>` : ''}
                        </div>

                        <div class="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                            <div class="flex items-center gap-3 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                <span><i class="fas fa-images text-teal-500 mr-1"></i>${utils.formatNumber(artworks)}</span>
                                <span><i class="fas fa-heart text-rose-500 mr-1"></i>${utils.formatNumber(loves)}</span>
                                <span><i class="fas fa-fire text-amber-500 mr-1"></i>${utils.formatNumber(fires)}</span>
                            </div>
                            <button type="button" data-creator-slug="${safeSlug}"
                                class="px-3.5 py-1.5 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap">
                                View Profile <i class="fas fa-arrow-right ml-1" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                </article>`;
        }).join('');
    },

    renderCreatorProfileHero(creator, isOwner = false) {
        const heroEl = elements.comitbaseCreatorHero || document.getElementById('comitbase-creator-hero');
        if (!heroEl || !creator) return;
        const safeName = utils.escapeHtml(creator.profileName || 'Creator');
        const safeSlug = utils.escapeHtml(creator.slug || '');
        const safeDesc = utils.escapeHtml(creator.description || '');
        const initials = (creator.profileName || 'ZX').slice(0, 2).toUpperCase();
        const linksHtml = (Array.isArray(creator.socialLinks) ? creator.socialLinks : [])
            .map((raw) => {
                const meta = this._socialLinkMeta(raw);
                if (!meta) return '';
                return `<a href="${utils.escapeHtml(meta.href)}" target="_blank" rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-teal-500 hover:text-white text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors">
                    <i class="${utils.escapeHtml(meta.icon)}" aria-hidden="true"></i>
                    <span>${utils.escapeHtml(meta.label)}</span>
                    <i class="fas fa-arrow-up-right-from-square text-[9px] opacity-70" aria-hidden="true"></i>
                </a>`;
            }).join('');

        heroEl.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div class="flex items-start gap-4">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 text-gray-950 font-black text-xl flex items-center justify-center shadow-lg shrink-0">
                        ${utils.escapeHtml(initials)}
                    </div>
                    <div class="space-y-2">
                        <div class="flex flex-wrap items-center gap-2">
                            <h2 class="text-2xl font-black text-gray-900 dark:text-white">${safeName}</h2>
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-300 border border-teal-500/30 text-[11px] font-bold">
                                <i class="fas fa-certificate" aria-hidden="true"></i> Verified Creator
                            </span>
                            ${isOwner ? '<span class="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold">Owner View</span>' : ''}
                        </div>
                        <div class="text-xs font-mono text-gray-500 dark:text-gray-400">@${safeSlug}</div>
                        <p class="text-sm text-gray-600 dark:text-gray-300 max-w-2xl leading-relaxed">${safeDesc}</p>
                        ${linksHtml ? `<div class="flex flex-wrap gap-2 pt-1">${linksHtml}</div>` : ''}
                    </div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 gap-2.5 shrink-0">
                    <div class="px-3.5 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/70 text-center">
                        <div class="text-lg font-black text-gray-900 dark:text-white">${utils.formatNumber(creator.artworkCount ?? creator.uploadCount ?? state.comitbasePhotos.length ?? 0)}</div>
                        <div class="text-[10px] font-bold uppercase text-gray-500">Artworks</div>
                    </div>
                    <div class="px-3.5 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/70 text-center">
                        <div class="text-lg font-black text-rose-500">${utils.formatNumber(creator.totalLoves ?? creator.loveCount ?? 0)}</div>
                        <div class="text-[10px] font-bold uppercase text-gray-500">Loves</div>
                    </div>
                    <div class="px-3.5 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/70 text-center">
                        <div class="text-lg font-black text-amber-500">${utils.formatNumber(creator.totalFires ?? creator.fireCount ?? 0)}</div>
                        <div class="text-[10px] font-bold uppercase text-gray-500">Fire</div>
                    </div>
                    <div class="px-3.5 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/70 text-center">
                        <div class="text-lg font-black text-sky-500">${utils.formatNumber(creator.totalDownloads ?? creator.downloadCount ?? 0)}</div>
                        <div class="text-[10px] font-bold uppercase text-gray-500">Downloads</div>
                    </div>
                </div>
            </div>`;
    },

    async openComitbaseCreatorProfile(slug, { persist = true, scroll = true } = {}) {
        const cleanSlug = String(slug || '').trim().toLowerCase();
        if (!cleanSlug) {
            this.closeComitbaseCreatorProfile();
            return false;
        }

        const dirView = elements.comitbaseDirectoryView || document.getElementById('comitbase-directory-view');
        const profView = elements.comitbaseProfileView || document.getElementById('comitbase-profile-view');
        const uploadCard = elements.comitbaseOwnerUploadCard || document.getElementById('comitbase-owner-upload-card');

        if (dirView) dirView.classList.add('hidden');
        if (profView) profView.classList.remove('hidden');
        if (elements.comitbaseCreatorHero) {
            elements.comitbaseCreatorHero.innerHTML = '<div class="py-8 text-center text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>Loading creator profile...</div>';
        }

        const result = await api.fetchComitbaseCreatorProfile(cleanSlug);
        if (!result.success || !result.creator) {
            this.showToast(result.error || 'Creator profile not found.', 'error');
            this.closeComitbaseCreatorProfile();
            return false;
        }

        state.currentCategory = 'COMITBASE';
        state.currentComitbaseCreatorSlug = result.creator.slug;
        state.currentComitbaseCreator = result.creator;
        state.comitbasePhotos = result.photos || [];
        state.comitbaseError = false;
        state.currentComitbasePage = 1;
        this.invalidateComitbaseSortCache();

        this.renderCreatorProfileHero(result.creator, result.isOwner);
        if (uploadCard) {
            const canUpload = Boolean(result.isOwner && result.creator.status === 'approved');
            uploadCard.classList.toggle('hidden', !canUpload);
        }

        this.showToolbar();
        this.renderComitbaseGallery();
        if (persist && typeof saveViewState === 'function') saveViewState();
        if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
    },

    closeComitbaseCreatorProfile() {
        state.currentComitbaseCreatorSlug = null;
        state.currentComitbaseCreator = null;
        state.currentComitbasePage = 1;
        const uploadCard = elements.comitbaseOwnerUploadCard || document.getElementById('comitbase-owner-upload-card');
        if (uploadCard) uploadCard.classList.add('hidden');
        if (typeof saveViewState === 'function') saveViewState();
        this.renderComitbaseDirectory();
    },

    renderComitbaseGallery({ append = false, previousCount = 0 } = {}) {
        if (!state.currentComitbaseCreatorSlug) {
            this.renderComitbaseDirectory();
            return;
        }
        if (!elements.comitbaseGallery) return;

        if (state.comitbasePhotos.length === 0) {
            this.renderBucketErrorOrEmpty(elements.comitbaseGallery, {
                isError: state.comitbaseError,
                retryAction: 'retry-comitbase',
                errorLabel: 'Failed to load creator collection',
                emptyIcon: 'fa-images',
                emptyLabel: 'No artworks uploaded in this collection yet',
            });
            this.updateToolbarCount(0);
            this.updateComitbasePagination(0);
            return;
        }

        if (state.aspectFilter !== 'all') {
            this.probeMissingRatios(state.comitbasePhotos, () => {
                if (state.aspectFilter !== 'all' && state.currentCategory === 'COMITBASE' && state.currentComitbaseCreatorSlug) {
                    this.renderComitbaseGallery();
                }
            });
        }

        const displayPhotos = this.getComitbaseDisplayPhotos();
        this.updateToolbarCount(displayPhotos.length);

        if (displayPhotos.length === 0) {
            this.renderRatioEmptyBanner(elements.comitbaseGallery, state.currentComitbaseCreator?.profileName || 'Creator Collection');
            this.updateComitbasePagination(0);
            return;
        }

        const slice = galleryFilters.getPaginationSliceInfo(
            displayPhotos.length,
            state.currentComitbasePage,
            ITEMS_PER_PAGE,
            state.browseMode
        );
        state.currentComitbasePage = slice.page;

        const renderStart  = append ? Math.min(previousCount, slice.end) : slice.start;
        const photosToShow = displayPhotos.slice(renderStart, slice.end);
        const allowOwnerDelete = Boolean(
            state.myCreatorProfile?.slug &&
            state.currentComitbaseCreator?.slug &&
            state.myCreatorProfile.slug === state.currentComitbaseCreator.slug &&
            state.myCreatorProfile.status === 'approved'
        );

        const imageObserver = this.getGallerySliceObserver('_comitbaseObserver', { append, rootMargin: '500px 0px' });
        this.renderMasonryItems(elements.comitbaseGallery, photosToShow, {
            append,
            startIndex: renderStart,
            imageObserver,
            getItemOptions: () => ({
                isDtreasureCard: false,
                allowOwnerDelete,
            }),
        });
        this.setupComitbaseEventListeners();
        this.updateComitbasePagination(displayPhotos.length);
    },

    loadMoreComitbase() {
        this.loadMoreSection(this.getComitbaseDisplayPhotos(), 'currentComitbasePage', (opts) => this.renderComitbaseGallery(opts));
    },

    setupComitbaseEventListeners() {
        this.bindMasonryDelegation(elements.comitbaseGallery, 'comitbaseClickHandler', () => state.comitbasePhotos);
    },

    updateComitbasePagination(totalOverride = null) {
        const totalItems = totalOverride !== null ? totalOverride : this.getComitbaseDisplayPhotos().length;
        this.updateSectionPagination({
            containerEl: elements.comitbasePagination || document.getElementById('comitbase-pagination'),
            loadMoreEl:  elements.comitbaseLoadMore || document.getElementById('comitbase-load-more'),
            totalItems,
            currentPage: state.currentComitbasePage,
            observerKey: '_comitbaseInfiniteObserver',
            ids: {
                sentinel:    'comitbase-infinite-sentinel',
                loadedInfo:  'comitbase-loaded-info',
                loadMoreBtn: 'comitbase-load-more-btn',
                pageInfo:    'comitbase-page-info',
                prevBtn:     'comitbase-prev',
                nextBtn:     'comitbase-next',
            },
            onLoadMore: () => this.loadMoreComitbase(),
        });
    },

    openComitbaseSubmitModal() {
        if (state.myCreatorProfile?.status === 'approved' && state.myCreatorProfile?.slug) {
            this.openComitbaseCreatorProfile(state.myCreatorProfile.slug);
            return;
        }
        const modal = document.getElementById('comitbase-submit-modal');
        if (!modal) return;
        const form = document.getElementById('comitbase-submit-form');
        const errBox = document.getElementById('comitbase-submit-error');
        form?.reset();
        errBox?.classList.add('hidden');
        if (state.myCreatorProfile) {
            const nameInput = document.getElementById('creator-apply-name');
            const descInput = document.getElementById('creator-apply-desc');
            const s1Input = document.getElementById('creator-apply-social-1');
            const s2Input = document.getElementById('creator-apply-social-2');
            if (nameInput) nameInput.value = state.myCreatorProfile.profileName || '';
            if (descInput) descInput.value = state.myCreatorProfile.description || '';
            if (s1Input && state.myCreatorProfile.socialLinks?.[0]) s1Input.value = this._safeExternalHttpUrl(state.myCreatorProfile.socialLinks[0]);
            if (s2Input && state.myCreatorProfile.socialLinks?.[1]) s2Input.value = this._safeExternalHttpUrl(state.myCreatorProfile.socialLinks[1]);
        }
        this.setModalOpen(modal, true);
    },

    closeComitbaseSubmitModal() {
        this.setModalOpen('comitbase-submit-modal', false);
    },

    async submitCreatorApplication({ profileName, description, socialLinks }) {
        const errBox = document.getElementById('comitbase-submit-error');
        const submitBtn = document.getElementById('comitbase-submit-btn');
        if (errBox) errBox.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Submitting...</span>';
        }
        try {
            const result = await api.applyComitbaseCreator({ profileName, description, socialLinks });
            if (!result.success) {
                if (errBox) {
                    errBox.textContent = result.error || 'Could not submit application.';
                    errBox.classList.remove('hidden');
                }
                return false;
            }
            this.closeComitbaseSubmitModal();
            this._syncComitbaseCtaAndBanner();
            this.showToast('Creator application submitted! Awaiting admin approval.', 'success', 4500);
            return true;
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i><span>Submit Application</span>';
            }
        }
    },

    async submitCreatorArtwork({ title, imageData }) {
        const slug = state.currentComitbaseCreatorSlug;
        const alertEl = document.getElementById('creator-upload-alert');
        const btn = document.getElementById('creator-upload-submit-btn');
        if (!slug) return false;
        if (alertEl) alertEl.classList.add('hidden');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Uploading...</span>';
        }
        try {
            const res = await api.uploadToCreatorProfile(slug, { title, imageData });
            if (!res.success) {
                if (alertEl) {
                    alertEl.className = 'p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 text-xs font-semibold';
                    alertEl.textContent = res.error || 'Upload failed.';
                    alertEl.classList.remove('hidden');
                }
                return false;
            }
            if (alertEl) {
                alertEl.className = 'p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-semibold';
                alertEl.textContent = `Uploaded "${res.photo?.title || title}" to your collection!`;
                alertEl.classList.remove('hidden');
            }
            this.showToast('Artwork added to your creator profile!', 'success');
            await this.openComitbaseCreatorProfile(slug, { persist: false, scroll: false });
            api.fetchComitbaseCreators().catch(() => {});
            return true;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-cloud-arrow-up" aria-hidden="true"></i><span>Upload Artwork</span>';
            }
        }
    },

    async deleteCreatorArtwork(photoId) {
        const slug = state.currentComitbaseCreatorSlug;
        if (!slug || !photoId) return;
        const res = await api.deleteCreatorArtwork(slug, photoId);
        if (!res.success) {
            this.showToast(res.error || 'Could not remove artwork.', 'error');
            return;
        }
        this.showToast('Artwork removed from collection.', 'info');
        await this.openComitbaseCreatorProfile(slug, { persist: false, scroll: false });
        api.fetchComitbaseCreators().catch(() => {});
    },
});
