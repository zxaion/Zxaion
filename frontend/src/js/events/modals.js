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

    document.getElementById('modal-mockup-bar')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mockup-mode]');
        if (btn && btn.dataset.mockupMode) {
            ui.setMockupMode(btn.dataset.mockupMode);
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
