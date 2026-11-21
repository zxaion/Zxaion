/**
 * events/global.js — Dark mode, ESC menutup modal, klik backdrop.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function _cleanupPayPalModalState() {
    if (typeof _paypalSdkWaitTimer !== 'undefined' && _paypalSdkWaitTimer) {
        clearInterval(_paypalSdkWaitTimer);
        _paypalSdkWaitTimer = null;
    }
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

    // Proteksi modal-img-shield & thumbnail shield tanpa inline oncontextmenu/ondragstart (CSP ketat)
    const preventShieldEvent = (e) => {
        if (e.target.closest('#modal-img-shield, .dtreasure-thumb-shield')) {
            e.preventDefault();
        }
    };
    document.addEventListener('contextmenu', preventShieldEvent);
    document.addEventListener('dragstart',   preventShieldEvent);

    // Delegasi tombol UI berbasis data-action tanpa inline onclick=""
    document.addEventListener('click', async (e) => {
        const trigger = e.target.closest('[data-action]');
        if (!trigger) return;
        const action = trigger.dataset.action;

        if (action === 'reset-aspect-filter') {
            window.resetAspectFilter();
        } else if (action === 'switch-dtreasure-tab') {
            window.switchDtreasureTab(trigger.dataset.tab || 'all');
        } else if (action === 'open-buy-credits') {
            document.getElementById('buy-credits-btn')?.click();
        } else if (action === 'open-anime-album') {
            ui.openAnimeAlbum(trigger.dataset.album || 'ORIGINAL');
        } else if (action === 'refresh-images') {
            window.refreshImages();
        } else if (action === 'change-category') {
            ui.changeCategory(trigger.dataset.category || 'All');
        } else if (action === 'retry-comitbase') {
            state.comitbaseError = false;
            await api.fetchComitbaseImages();
            ui.renderComitbaseGallery();
        } else if (action === 'retry-dtreasure') {
            state.dtreasureError = false;
            await api.fetchDtreasureImages();
            ui.renderDtreasureGallery();
        }
    });
}
