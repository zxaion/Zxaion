/**
 * events/global.js — Dark mode, ESC menutup modal, klik backdrop.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function _cleanupPayPalModalState() {
    if (typeof paypalButtonsInstance !== 'undefined' && paypalButtonsInstance) {
        try { paypalButtonsInstance.close(); } catch (_) {}
        paypalButtonsInstance = null;
    }
    if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
    if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
    document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
    state.selectedCreditPack = null;
}

function initGlobalEvents() {
    document.getElementById('darkmode-toggle')?.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
    });
    if (localStorage.getItem('darkMode') === 'true') document.documentElement.classList.add('dark');

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modals = [
            elements.imageModal,
            document.getElementById('donation-modal'),
            document.getElementById('zverse-modal'),
            document.getElementById('menu-modal'),
            document.getElementById('quicklink-content-modal'),
            document.getElementById('buy-credits-modal'),
            document.getElementById('crypto-modal')
        ];

        let anyOpen = false;
        modals.forEach(modal => {
            if (!modal || modal.classList.contains('hidden')) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            anyOpen = true;

            if (modal.id === 'buy-credits-modal') {
                _cleanupPayPalModalState();
            }
        });
        if (anyOpen) document.body.style.overflow = '';
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.classList.add('hidden');
                backdrop.classList.remove('flex');
                document.body.style.overflow = '';
                if (backdrop.id === 'buy-credits-modal') {
                    _cleanupPayPalModalState();
                }
            }
        });
    });
}
