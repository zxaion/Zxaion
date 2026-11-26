/**
 * events/global.js — Dark mode, ESC menutup modal, klik backdrop.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function _applyThemeState(isDark, { persist = false } = {}) {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

    const toggleBtn = document.getElementById('darkmode-toggle');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-checked', isDark ? 'true' : 'false');
        toggleBtn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
        themeMeta.setAttribute('content', isDark ? '#030712' : '#ffffff');
    }

    if (persist) {
        try { localStorage.setItem('darkMode', String(isDark)); } catch (_) {}
    }
}

// Apply saved or OS-preferred theme immediately when script executes
(() => {
    let saved = null;
    try { saved = localStorage.getItem('darkMode'); } catch (_) {}
    const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const isDark = saved !== null ? saved === 'true' : Boolean(prefersDark);
    _applyThemeState(isDark, { persist: false });
})();

function initGlobalEvents() {
    const toggleBtn = document.getElementById('darkmode-toggle');
    if (toggleBtn) {
        _applyThemeState(document.documentElement.classList.contains('dark'), { persist: false });
        toggleBtn.addEventListener('click', () => {
            const nextDark = !document.documentElement.classList.contains('dark');
            _applyThemeState(nextDark, { persist: true });
        });
    }

    // Ikuti perubahan tema sistem bila user belum memilih manual
    try {
        const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
        mediaQuery?.addEventListener?.('change', (e) => {
            if (localStorage.getItem('darkMode') === null) {
                _applyThemeState(e.matches, { persist: false });
            }
        });
    } catch (_) {}

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (elements.imageModal && !elements.imageModal.classList.contains('hidden')) {
            ui.closeImageModal();
            return;
        }
        if (elements.purchaseSuccessModal && !elements.purchaseSuccessModal.classList.contains('hidden')) {
            ui.closePurchaseSuccessModal();
            return;
        }
        if (elements.accountModal && !elements.accountModal.classList.contains('hidden')) {
            ui.closeAccountModal();
            return;
        }
        const buyModal = document.getElementById('buy-credits-modal');
        if (buyModal && !buyModal.classList.contains('hidden')) {
            ui.closeBuyCreditsModal();
            return;
        }
        ['donation-modal', 'zverse-modal', 'menu-modal', 'quicklink-content-modal', 'crypto-modal'].forEach(id => {
            const modal = document.getElementById(id);
            if (modal && !modal.classList.contains('hidden')) {
                ui.setModalOpen(modal, false);
            }
        });
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            if (e.target !== backdrop) return;
            if (backdrop.id === 'buy-credits-modal') {
                ui.closeBuyCreditsModal();
            } else {
                ui.setModalOpen(backdrop, false);
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
            ui.resetAspectFilter();
        } else if (action === 'switch-dtreasure-tab') {
            ui.switchDtreasureTab(trigger.dataset.tab || 'all');
        } else if (action === 'open-buy-credits') {
            document.getElementById('buy-credits-btn')?.click();
        } else if (action === 'open-anime-album') {
            ui.openAnimeAlbum(trigger.dataset.album || 'ORIGINAL');
        } else if (action === 'refresh-images') {
            ui.refreshImages();
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
