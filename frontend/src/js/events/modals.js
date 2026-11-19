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

    // Image modal close
    document.getElementById('close-image-modal')?.addEventListener('click', () => {
        elements.imageModal?.classList.add('hidden');
        elements.imageModal?.classList.remove('flex');
        document.body.style.overflow = '';
    });

    elements.imageModal?.addEventListener('click', (e) => {
        if (e.target === elements.imageModal) {
            elements.imageModal.classList.add('hidden');
            elements.imageModal.classList.remove('flex');
            document.body.style.overflow = '';
        }
    });
}
