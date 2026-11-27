/**
 * events/pagination.js — Paginasi, Infinite Scroll/Load More, Sort & Filter Rasio, Tab DTREASURE Library + COMIT HERE.
 * Depends on: state, elements, ui, utils, api, galleryFilters, ITEMS_PER_PAGE
 */
function initPaginationEvents() {
    const rerenderActiveSection = () => {
        if (state.currentCategory === 'COMITBASE') {
            ui.renderComitbaseGallery();
        } else if (state.currentCategory === 'DTREASURE') {
            ui.renderDtreasureGallery();
        } else {
            ui.renderGallery();
        }
    };

    const setBrowseMode = (mode) => {
        state.browseMode = mode === 'infinite' ? 'infinite' : 'pagination';
        try { localStorage.setItem('zxaion_browse_mode', state.browseMode); } catch (_) {}
        state.resetPagination();
        if (typeof saveViewState === 'function') saveViewState();
        ui.syncToolbarUI();
        rerenderActiveSection();
    };

    // Main Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (state.currentPage > 1) { state.currentPage--; saveViewState?.(); ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
        const total = Math.ceil(ui.getMainDisplayPhotos().length / ITEMS_PER_PAGE);
        if (state.currentPage < total) { state.currentPage++; saveViewState?.(); ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('gallery-load-more-btn')?.addEventListener('click', () => ui.loadMoreGallery());

    // COMITBASE pagination & Load More
    document.getElementById('comitbase-prev')?.addEventListener('click', () => {
        if (state.currentComitbasePage > 1) { state.currentComitbasePage--; saveViewState?.(); ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('comitbase-next')?.addEventListener('click', () => {
        const total = Math.ceil(ui.getComitbaseDisplayPhotos().length / ITEMS_PER_PAGE);
        if (state.currentComitbasePage < total) { state.currentComitbasePage++; saveViewState?.(); ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('comitbase-load-more-btn')?.addEventListener('click', () => ui.loadMoreComitbase());

    // DTREASURE pagination & Load More
    document.getElementById('dtreasure-prev')?.addEventListener('click', () => {
        if (state.currentDtreasurePage > 1) { state.currentDtreasurePage--; saveViewState?.(); ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('dtreasure-next')?.addEventListener('click', () => {
        const total = Math.ceil(ui.getDtreasureDisplayPhotos().length / ITEMS_PER_PAGE);
        if (state.currentDtreasurePage < total) { state.currentDtreasurePage++; saveViewState?.(); ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('dtreasure-load-more-btn')?.addEventListener('click', () => ui.loadMoreDtreasure());

    // Sort Buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sort = btn.dataset.sort || 'latest';
            state.sortBy = sort;
            state.resetPagination();
            saveViewState?.();
            ui.invalidateMainSortCache();
            ui.invalidateComitbaseSortCache();
            ui.invalidateDtreasureSortCache();
            ui.syncToolbarUI();
            rerenderActiveSection();
        });
    });

    // Aspect Ratio Filter Buttons
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.aspectFilter = btn.dataset.ratio || 'all';
            state.resetPagination();
            saveViewState?.();
            ui.syncToolbarUI();
            rerenderActiveSection();
        });
    });

    // Browse Mode Toggle (Toolbar button + Footer switch pills)
    document.getElementById('browse-mode-toggle')?.addEventListener('click', () => {
        setBrowseMode(state.browseMode === 'infinite' ? 'pagination' : 'infinite');
    });
    document.querySelectorAll('[data-switch-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            setBrowseMode(btn.dataset.switchMode);
        });
    });

    // DTREASURE Tabs (All Vault vs My Unlocked / Library)
    document.querySelectorAll('.dtreasure-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.dtreasureTab = btn.dataset.dtreasureTab === 'library' ? 'library' : 'all';
            state.currentDtreasurePage = 1;
            saveViewState?.();
            ui.invalidateDtreasureSortCache();
            ui.renderDtreasureGallery();
        });
    });

    // COMITBASE — Verified Creator Application, Directory Search & Owner Upload Studio
    const comitModal = document.getElementById('comitbase-submit-modal');
    const comitErrBox = document.getElementById('comitbase-submit-error');
    const showComitError = (msg) => {
        if (!comitErrBox) return;
        comitErrBox.textContent = msg;
        comitErrBox.classList.remove('hidden');
    };

    document.getElementById('comit-here-btn')?.addEventListener('click', () => {
        ui.openComitbaseSubmitModal();
    });

    document.getElementById('close-comitbase-submit-modal')?.addEventListener('click', () => ui.closeComitbaseSubmitModal());
    document.getElementById('comitbase-submit-cancel')?.addEventListener('click', () => ui.closeComitbaseSubmitModal());
    comitModal?.addEventListener('click', (e) => {
        if (e.target === comitModal) ui.closeComitbaseSubmitModal();
    });

    document.getElementById('comitbase-submit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        comitErrBox?.classList.add('hidden');
        const profileName = document.getElementById('creator-apply-name')?.value?.trim() || '';
        const description = document.getElementById('creator-apply-desc')?.value?.trim() || '';
        const social1 = document.getElementById('creator-apply-social-1')?.value?.trim() || '';
        const social2 = document.getElementById('creator-apply-social-2')?.value?.trim() || '';

        if (profileName.length < 2) {
            showComitError('Profile Name must be at least 2 characters.');
            return;
        }
        if (description.length < 10) {
            showComitError('Profile Description must be at least 10 characters.');
            return;
        }
        const isHttpUrl = (val) => {
            try {
                const u = new URL(val);
                return u.protocol === 'https:' || u.protocol === 'http:';
            } catch {
                return false;
            }
        };
        if (!isHttpUrl(social1)) {
            showComitError('Please provide a valid social media link (https://...).');
            return;
        }
        if (social2 && !isHttpUrl(social2)) {
            showComitError('Secondary social link must start with https:// or http://.');
            return;
        }
        const socialLinks = social2 ? [social1, social2] : [social1];
        await ui.submitCreatorApplication({ profileName, description, socialLinks });
    });

    document.getElementById('comitbase-creator-search')?.addEventListener('input', (e) => {
        state.comitbaseCreatorSearch = e.target.value || '';
        ui.renderComitbaseDirectory();
    });

    document.getElementById('comitbase-creators-grid')?.addEventListener('click', (e) => {
        if (e.target.closest('[data-social-link]') || e.target.closest('a[href]')) return;
        const trigger = e.target.closest('[data-creator-slug]') || e.target.closest('[data-creator-card]');
        if (!trigger) return;
        const slug = trigger.dataset.creatorSlug || trigger.dataset.creatorCard;
        if (slug) {
            ui.openComitbaseCreatorProfile(slug);
        }
    });

    document.getElementById('comitbase-back-creators-btn')?.addEventListener('click', () => {
        ui.closeComitbaseCreatorProfile();
    });

    document.getElementById('comitbase-profile-share-btn')?.addEventListener('click', async () => {
        const slug = state.currentComitbaseCreatorSlug;
        if (!slug) return;
        const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
        const profileUrl = `${origin}/?cat=COMITBASE&creator=${encodeURIComponent(slug)}`;
        try {
            await utils.copyText(profileUrl);
            ui.showToast('Creator profile link copied!', 'success');
        } catch {
            ui.showToast(`Profile URL: ${profileUrl}`, 'info');
        }
    });

    document.getElementById('comitbase-owner-upload-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const titleInput = document.getElementById('creator-upload-title');
        const fileInput = document.getElementById('creator-upload-file');
        const alertEl = document.getElementById('creator-upload-alert');
        const title = titleInput?.value?.trim() || '';
        const file = fileInput?.files?.[0];

        if (title.length < 2) {
            if (alertEl) {
                alertEl.className = 'p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold';
                alertEl.textContent = 'Please enter a valid artwork title (min 2 characters).';
                alertEl.classList.remove('hidden');
            }
            return;
        }
        if (!file) {
            if (alertEl) {
                alertEl.className = 'p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold';
                alertEl.textContent = 'Please select an image file first.';
                alertEl.classList.remove('hidden');
            }
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            if (alertEl) {
                alertEl.className = 'p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold';
                alertEl.textContent = 'Image file exceeds 5 MB limit.';
                alertEl.classList.remove('hidden');
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            if (!result.startsWith('data:image/')) {
                ui.showToast('Unsupported image file.', 'error');
                return;
            }
            const ok = await ui.submitCreatorArtwork({ title, imageData: result });
            if (ok) {
                e.target.reset();
            }
        };
        reader.readAsDataURL(file);
    });
}
