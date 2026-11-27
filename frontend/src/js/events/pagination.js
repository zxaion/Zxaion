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

    // COMIT HERE — In-website upload modal
    let comitbasePendingDataUrl = '';
    const comitModal = document.getElementById('comitbase-submit-modal');
    const comitFileInput = document.getElementById('comitbase-file-input');
    const comitPreviewImg = document.getElementById('comitbase-preview-img');
    const comitPlaceholder = document.getElementById('comitbase-upload-placeholder');
    const comitFileMeta = document.getElementById('comitbase-file-meta');
    const comitErrBox = document.getElementById('comitbase-submit-error');

    const showComitError = (msg) => {
        if (!comitErrBox) return;
        comitErrBox.textContent = msg;
        comitErrBox.classList.remove('hidden');
    };

    document.getElementById('comit-here-btn')?.addEventListener('click', () => {
        comitbasePendingDataUrl = '';
        ui.openComitbaseSubmitModal();
    });

    document.getElementById('close-comitbase-submit-modal')?.addEventListener('click', () => ui.closeComitbaseSubmitModal());
    document.getElementById('comitbase-submit-cancel')?.addEventListener('click', () => ui.closeComitbaseSubmitModal());
    comitModal?.addEventListener('click', (e) => {
        if (e.target === comitModal) ui.closeComitbaseSubmitModal();
    });

    comitFileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        comitErrBox?.classList.add('hidden');
        comitbasePendingDataUrl = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showComitError('Image file exceeds 5 MB limit.');
            comitFileInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            if (!result.startsWith('data:image/')) {
                showComitError('Invalid image format. Please choose PNG, JPEG, WebP, or GIF.');
                return;
            }
            comitbasePendingDataUrl = result;
            if (comitPreviewImg) {
                comitPreviewImg.src = result;
                comitPreviewImg.classList.remove('hidden');
            }
            comitPlaceholder?.classList.add('hidden');
            if (comitFileMeta) {
                comitFileMeta.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            }
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('comitbase-submit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        comitErrBox?.classList.add('hidden');
        const title = document.getElementById('comitbase-title-input')?.value?.trim() || '';
        const creator = document.getElementById('comitbase-creator-input')?.value?.trim() || '';
        const submitBtn = document.getElementById('comitbase-submit-btn');

        if (title.length < 2) {
            showComitError('Please enter a valid artwork title (min 2 characters).');
            return;
        }
        if (!comitbasePendingDataUrl) {
            showComitError('Please choose an image file to publish.');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Publishing...</span>';
        }

        const res = await api.submitComitbaseArtwork({
            title,
            creator,
            imageData: comitbasePendingDataUrl,
        });

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i><span>Publish to COMITBASE</span>';
        }

        if (!res.success) {
            showComitError(res.error || 'Submission failed.');
            return;
        }

        comitbasePendingDataUrl = '';
        ui.closeComitbaseSubmitModal();
        state.currentComitbasePage = 1;
        ui.renderComitbaseGallery();
        ui.showToast(`"${res.photo?.title || title}" published to COMITBASE!`, 'success', 4500);
    });
}
