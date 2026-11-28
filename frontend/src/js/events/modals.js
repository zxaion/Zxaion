/**
 * events/modals.js — Modal ZVERSE, MENU, quicklink content, tutup image modal.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initModalEvents() {
    // ZVERSE modal
    const zverseModal = document.getElementById('zverse-modal');
    document.getElementById('zverse-btn')?.addEventListener('click', () => ui.setModalOpen(zverseModal, true, { lockScroll: false }));
    document.getElementById('close-zverse')?.addEventListener('click', () => ui.setModalOpen(zverseModal, false));

    // MENU modal
    const menuModal = document.getElementById('menu-modal');
    document.getElementById('menu-btn')?.addEventListener('click', () => {
        ui.loadQuicklinks();
        ui.setModalOpen(menuModal, true, { lockScroll: false });
    });
    document.getElementById('close-menu')?.addEventListener('click', () => ui.setModalOpen(menuModal, false));

    // Quicklink content modal
    const quicklinkContentModal = document.getElementById('quicklink-content-modal');
    document.getElementById('close-quicklink-content')?.addEventListener('click', () => {
        ui.setModalOpen(quicklinkContentModal, false);
    });

    // Image modal close & share
    document.getElementById('close-image-modal')?.addEventListener('click', () => {
        ui.closeImageModal();
    });

    elements.imageModal?.addEventListener('click', (e) => {
        if (e.target === elements.imageModal) {
            ui.closeImageModal();
        }
    });

    document.getElementById('share-btn')?.addEventListener('click', () => {
        ui.sharePhoto(state.currentPhoto);
    });

    document.getElementById('modal-love-btn')?.addEventListener('click', () => {
        if (state.currentPhoto) {
            ui.togglePhotoLove(state.currentPhoto);
        }
    });

    document.getElementById('modal-fire-btn')?.addEventListener('click', () => {
        if (state.currentPhoto) {
            ui.togglePhotoFire?.(state.currentPhoto);
        }
    });

    document.getElementById('modal-mockup-bar')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mockup-mode]');
        if (btn && btn.dataset.mockupMode) {
            ui.setMockupMode(btn.dataset.mockupMode);
        }
    });

    // Desktop Mockup interactive pan & zoom controls
    const mockupStage = document.getElementById('modal-mockup-stage');
    const zoomRange = document.getElementById('modal-desktop-zoom-range');
    const zoomOutBtn = document.getElementById('modal-desktop-zoom-out');
    const zoomInBtn = document.getElementById('modal-desktop-zoom-in');
    const desktopResetBtn = document.getElementById('modal-desktop-reset');

    zoomOutBtn?.addEventListener('click', () => {
        const cur = state.desktopMockupTransform?.scale || 1;
        ui.setDesktopMockupZoom(cur - 0.25);
    });
    zoomInBtn?.addEventListener('click', () => {
        const cur = state.desktopMockupTransform?.scale || 1;
        ui.setDesktopMockupZoom(cur + 0.25);
    });
    zoomRange?.addEventListener('input', (e) => {
        ui.setDesktopMockupZoom(parseFloat(e.target.value));
    });
    desktopResetBtn?.addEventListener('click', () => {
        ui.resetDesktopMockupTransform();
    });

    if (mockupStage) {
        let dragState = null;

        mockupStage.addEventListener('pointerdown', (e) => {
            if (state.currentMockupMode !== 'desktop') return;
            if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
            e.preventDefault();
            dragState = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                origX: state.desktopMockupTransform?.x || 0,
                origY: state.desktopMockupTransform?.y || 0,
            };
            mockupStage.classList.add('is-dragging');
            try {
                mockupStage.setPointerCapture?.(e.pointerId);
            } catch (_) {}
        });

        mockupStage.addEventListener('pointermove', (e) => {
            if (!dragState || e.pointerId !== dragState.pointerId || state.currentMockupMode !== 'desktop') return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            ui.panDesktopMockupTo(dragState.origX + dx, dragState.origY + dy);
        });

        const endDrag = (e) => {
            if (!dragState || (e.pointerId !== undefined && e.pointerId !== dragState.pointerId)) return;
            try {
                mockupStage.releasePointerCapture?.(dragState.pointerId);
            } catch (_) {}
            dragState = null;
            mockupStage.classList.remove('is-dragging');
        };

        mockupStage.addEventListener('pointerup', endDrag);
        mockupStage.addEventListener('pointercancel', endDrag);

        mockupStage.addEventListener('wheel', (e) => {
            if (state.currentMockupMode !== 'desktop') return;
            e.preventDefault();
            const cur = state.desktopMockupTransform?.scale || 1;
            const delta = e.deltaY < 0 ? 0.14 : -0.14;
            ui.setDesktopMockupZoom(cur + delta);
        }, { passive: false });
    }

    window.addEventListener('resize', () => {
        if (
            state.currentMockupMode === 'desktop' &&
            elements.imageModal &&
            !elements.imageModal.classList.contains('hidden')
        ) {
            ui.fitDesktopMockupImage();
        }
    });

    document.getElementById('modal-related-grid')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-related-id]');
        if (!btn) return;
        const relatedId = btn.dataset.relatedId;
        const relPhoto = ui._relatedPhotoMap?.get(relatedId) || ui.findPhotoById(relatedId);
        if (relPhoto) {
            ui.openImageModal(relPhoto);
        }
    });

    // Resolution selection buttons
    document.getElementById('resolution-button-group')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.resolution-btn');
        if (btn && btn.dataset.resolution) {
            ui.selectResolution(btn.dataset.resolution);
        }
    });

    // Purchase Success & Backup Key Modal
    const purchaseSuccessModal = elements.purchaseSuccessModal || document.getElementById('purchase-success-modal');
    const closePurchaseX = elements.closePurchaseSuccessX || document.getElementById('close-purchase-success-x');
    const closePurchaseBtn = elements.closePurchaseSuccessBtn || document.getElementById('close-purchase-success-btn');
    const copyPurchaseBtn = elements.copyPurchaseRecoveryBtn || document.getElementById('copy-purchase-recovery-btn');
    const downloadReceiptBtn = elements.downloadPurchaseReceiptBtn || document.getElementById('download-purchase-receipt-btn');

    closePurchaseX?.addEventListener('click', () => ui.closePurchaseSuccessModal());
    closePurchaseBtn?.addEventListener('click', () => ui.closePurchaseSuccessModal());

    purchaseSuccessModal?.addEventListener('click', (e) => {
        if (e.target === purchaseSuccessModal) {
            ui.closePurchaseSuccessModal();
        }
    });

    copyPurchaseBtn?.addEventListener('click', async () => {
        const code = (elements.purchaseSuccessCode?.textContent || state.lastRecoveryCode || '').trim();
        if (!code || code === 'ZX-XXXX-XXXX-XXXX') return;
        try {
            await utils.copyText(code);
            const label = document.getElementById('copy-purchase-recovery-label');
            if (label) {
                const prev = label.textContent;
                label.textContent = 'Copied!';
                setTimeout(() => { label.textContent = prev; }, 2000);
            }
            ui.showToast('Recovery Key copied!', 'success');
        } catch {
            ui.showToast(`Recovery Code: ${code}`, 'info');
        }
    });

    downloadReceiptBtn?.addEventListener('click', () => {
        ui.downloadReceiptFile(state.lastRecoveryCode, state.selectedCreditPack?.key);
    });

    // Deep link and admin hashchange event listener
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#admin') {
            ui.openAdminSection();
        } else {
            if (typeof ui.isAdminOpen === 'function' && ui.isAdminOpen()) {
                elements.adminSection?.classList.add('hidden');
                document.getElementById('page-hero')?.classList.remove('hidden');
                document.querySelector('.category-nav')?.classList.remove('hidden');
            }
            ui.handleHashChange();
        }
    });
}
