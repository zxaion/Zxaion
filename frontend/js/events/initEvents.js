// frontend/js/events/initEvents.js
// Pendaftaran semua event listener UI
import { ITEMS_PER_PAGE } from '../config/constants.js';
import { state } from '../state/appState.js';
import { elements } from '../ui/elements.js';
import { ui } from '../ui/index.js';
import { utils } from '../utils/helpers.js';

export function initEvents() {
    // Home link
    document.getElementById('home-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        ui.changeCategory('All');
    });

    // Category buttons
    const categoryMap = {
        'cat-all':         'All',
        'cat-anime':       'Anime',
        'cat-fantasy':     'Fantasy',
        'cat-abstract':    'Abstract',
        'cat-photography': 'Photography',
        'cat-comitbase':   'COMITBASE',
        'cat-dtreasure':   'DTREASURE',
        'cat-zmeme':       'ZMEME',
        'cat-overlay':     'OVERLAY'
    };

    Object.entries(categoryMap).forEach(([id, category]) => {
        document.getElementById(id)?.addEventListener('click', () => ui.changeCategory(category));
    });

    // Search — separate debounce instances per input (cegah timer conflict)
    const debouncedSearchDesktop = utils.debounce((e) => {
        const query = e.target.value.trim();
        if (elements.searchInputMobile) elements.searchInputMobile.value = e.target.value;
        if (query.length > 0 || state.searchQuery !== '') ui.handleSearch(query);
    }, 300);

    const debouncedSearchMobile = utils.debounce((e) => {
        const query = e.target.value.trim();
        if (elements.searchInput) elements.searchInput.value = e.target.value;
        if (query.length > 0 || state.searchQuery !== '') ui.handleSearch(query);
    }, 300);

    if (elements.searchInput)       elements.searchInput.addEventListener('input', debouncedSearchDesktop);
    if (elements.searchInputMobile) elements.searchInputMobile.addEventListener('input', debouncedSearchMobile);

    elements.searchClear?.addEventListener('click', () => {
        if (elements.searchInput)       elements.searchInput.value = '';
        if (elements.searchInputMobile) elements.searchInputMobile.value = '';
        elements.searchClear.classList.add('hidden');
        ui.changeCategory(state.currentCategory);
    });

    // Donation modal
    const donationModal = document.getElementById('donation-modal');
    document.getElementById('donation-btn')?.addEventListener('click', () => {
        donationModal?.classList.remove('hidden');
        donationModal?.classList.add('flex');
    });
    document.getElementById('close-donation')?.addEventListener('click', () => {
        donationModal?.classList.add('hidden');
        donationModal?.classList.remove('flex');
    });

    // Crypto buttons
    document.querySelectorAll('.crypto-btn, .crypto-btn-usdt').forEach(btn => {
        btn.addEventListener('click', function() {
            const address     = this.dataset.address;
            const name        = this.dataset.name;
            const cryptoModal = document.getElementById('crypto-modal');
            const iconMap     = {
                'Bitcoin':  'fab fa-bitcoin text-3xl text-orange-500',
                'Ethereum': 'fab fa-ethereum text-3xl text-blue-500',
                'Solana':   'fas fa-sun text-3xl text-purple-500',
                'BNB':      'fas fa-bolt text-3xl text-yellow-500',
                'Polygon':  'fas fa-hexagon text-3xl text-indigo-500',
                'XRP':      'fas fa-chart-line text-3xl text-cyan-500',
            };
            const iconClass = Object.keys(iconMap).find(k => name?.includes(k));

            const cryptoTypeEl    = document.getElementById('crypto-type');
            const cryptoAddressEl = document.getElementById('crypto-address');
            const cryptoIconEl    = document.getElementById('crypto-icon');

            if (cryptoTypeEl)    cryptoTypeEl.textContent  = name;
            if (cryptoAddressEl) cryptoAddressEl.textContent = address;
            if (cryptoIconEl)    cryptoIconEl.className    = iconClass ? iconMap[iconClass] : 'fas fa-coins text-3xl text-gray-600 dark:text-gray-400';

            if (cryptoModal) { cryptoModal.classList.remove('hidden'); cryptoModal.classList.add('flex'); }
        });
    });

    // Copy crypto address
    document.getElementById('copy-crypto-address')?.addEventListener('click', function() {
        const address = document.getElementById('crypto-address')?.textContent;
        if (!address) return;
        navigator.clipboard.writeText(address).then(() => {
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
            this.classList.add('bg-green-600');
            setTimeout(() => { this.innerHTML = originalText; this.classList.remove('bg-green-600'); }, 2000);
        }).catch(() => alert('Failed to copy address'));
    });

    // Close crypto modal
    const cryptoModal = document.getElementById('crypto-modal');
    document.getElementById('close-crypto-modal')?.addEventListener('click', () => {
        cryptoModal?.classList.add('hidden'); cryptoModal?.classList.remove('flex');
    });

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

    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (state.currentPage > 1) { state.currentPage--; ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
        const total = Math.ceil(state.filteredPhotos.length / ITEMS_PER_PAGE);
        if (state.currentPage < total) { state.currentPage++; ui.renderGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // COMITBASE pagination
    document.getElementById('comitbase-prev')?.addEventListener('click', () => {
        if (state.currentComitbasePage > 1) { state.currentComitbasePage--; ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('comitbase-next')?.addEventListener('click', () => {
        const total = Math.ceil(state.comitbasePhotos.length / ITEMS_PER_PAGE);
        if (state.currentComitbasePage < total) { state.currentComitbasePage++; ui.renderComitbaseGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // DTREASURE pagination
    document.getElementById('dtreasure-prev')?.addEventListener('click', () => {
        if (state.currentDtreasurePage > 1) { state.currentDtreasurePage--; ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    document.getElementById('dtreasure-next')?.addEventListener('click', () => {
        const total = Math.ceil(state.dtreasurePhotos.length / ITEMS_PER_PAGE);
        if (state.currentDtreasurePage < total) { state.currentDtreasurePage++; ui.renderDtreasureGallery(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    // COMIT HERE
    document.getElementById('comit-here-btn')?.addEventListener('click', () => {
        const subject = 'COMITBASE Submission - Visual Composition';
        const body    = `Title:\nArtist Name:\nPlatform Name:\nArt Desc (optional):\nVisual Link: (Google Drive only)\n\n---\nSubmitted via ZXAION VERSE COMITBASE`;
        window.open(`mailto:zxaionxl@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    });

    // Buy Credits modal
    const buyCreditsModal = document.getElementById('buy-credits-modal');

    document.getElementById('buy-credits-btn')?.addEventListener('click', () => {
        ui.renderCreditPacks();
        buyCreditsModal?.classList.remove('hidden');
        buyCreditsModal?.classList.add('flex');
    });

    const closeBuyCredits = document.getElementById('close-buy-credits');
    if (closeBuyCredits && buyCreditsModal) {
        closeBuyCredits.addEventListener('click', () => {
            if (typeof state.paypalButtonsInstance !== 'undefined' && state.paypalButtonsInstance) {
                try { state.paypalButtonsInstance.close(); } catch (e) { console.warn('PayPal close error:', e); }
                state.paypalButtonsInstance = null;
            }
            buyCreditsModal.classList.add('hidden');
            buyCreditsModal.classList.remove('flex');
            document.body.style.overflow = '';
            if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
            if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
            document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
            state.selectedCreditPack = null;
        });
    }

    // Dark mode toggle
    document.getElementById('darkmode-toggle')?.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
    });
    if (localStorage.getItem('darkMode') === 'true') document.documentElement.classList.add('dark');

    // Keyboard shortcuts — ESC closes all modals
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
                if (typeof state.paypalButtonsInstance !== 'undefined' && state.paypalButtonsInstance) {
                    try { state.paypalButtonsInstance.close(); } catch (_) {}
                    state.paypalButtonsInstance = null;
                }
                if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
                if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
                document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
                state.selectedCreditPack = null;
            }
        });
        if (anyOpen) document.body.style.overflow = '';
    });

    // Backdrop click closes modal
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.classList.add('hidden');
                backdrop.classList.remove('flex');
                document.body.style.overflow = '';
            }
        });
    });
}
