/**
 * events/modals.js — Modal ZVERSE, MENU, quicklink content, tutup image modal.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initModalEvents() {
    // ZVERSE modal
    const zverseModal = document.getElementById('zverse-modal');
    document.getElementById('zverse-btn')?.addEventListener('click', () => { zverseModal?.classList.remove('hidden'); zverseModal?.classList.add('flex'); });
    document.getElementById('close-zverse')?.addEventListener('click', () => { zverseModal?.classList.add('hidden'); zverseModal?.classList.remove('flex'); });

    // MENU modal
    const menuModal = document.getElementById('menu-modal');
    document.getElementById('menu-btn')?.addEventListener('click', () => {
        ui.loadQuicklinks();
        menuModal?.classList.remove('hidden'); menuModal?.classList.add('flex');
    });
    document.getElementById('close-menu')?.addEventListener('click', () => { menuModal?.classList.add('hidden'); menuModal?.classList.remove('flex'); });

    // Quicklink content modal
    const quicklinkContentModal = document.getElementById('quicklink-content-modal');
    document.getElementById('close-quicklink-content')?.addEventListener('click', () => {
        quicklinkContentModal?.classList.add('hidden'); quicklinkContentModal?.classList.remove('flex');
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
            await navigator.clipboard.writeText(code);
            const label = document.getElementById('copy-purchase-recovery-label');
            if (label) {
                const prev = label.textContent;
                label.textContent = 'Tersalin!';
                setTimeout(() => { label.textContent = prev; }, 2000);
            }
            ui.showToast('Recovery Key berhasil disalin!', 'success');
        } catch {
            ui.showToast(`Kode Pemulihan: ${code}`, 'info');
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

    // Escape key closes modals
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (elements.imageModal && !elements.imageModal.classList.contains('hidden')) {
                ui.closeImageModal();
            } else if (purchaseSuccessModal && !purchaseSuccessModal.classList.contains('hidden')) {
                ui.closePurchaseSuccessModal();
            }
        }
    });
}
