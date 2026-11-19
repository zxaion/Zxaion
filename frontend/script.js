import {
    API_BASE,
    ITEMS_PER_PAGE,
    CATEGORIES,
    ANIME_SUB_ALBUMS,
    CREDIT_PACKS,
    applyLegacyWindowConfig
} from "./src/config/app.config.js";
import { state } from "./src/core/state.js";
import { getOrCreateUserToken } from "./src/services/session.service.js";
import { elements } from "./src/core/elements.js";
import { utils } from "./src/utils/helpers.js";
import { createApiService } from "./src/services/api.service.js";
import { ads } from "./src/services/ads.service.js";
import { createUiService } from "./src/ui/ui.service.js";

applyLegacyWindowConfig(window);

/** Mencegah long-press "Simpan Gambar" di mobile untuk gambar yang dilindungi. */
function preventTouchSave(e) { e.preventDefault(); }

// Timer untuk auto-refresh ranking carousel — dibersihkan saat ganti kategori.
let _carouselRefreshTimer = null;

// ============================================================
// ADS MODULE
// ============================================================
// --- DOM Elements ---
// --- API Calls ---
const api = createApiService({
    API_BASE,
    ANIME_SUB_ALBUMS,
    state,
    getOrCreateUserToken,
    utils,
    getUi: () => ui
});

// --- UI Functions ---
const ui = createUiService({
    API_BASE,
    ITEMS_PER_PAGE,
    ANIME_SUB_ALBUMS,
    CREDIT_PACKS,
    state,
    getOrCreateUserToken,
    utils,
    api,
    elements,
    ads,
    preventTouchSave,
    initPayPalPurchase
});

// ============================================================
// Dynamic sticky top — kalkulasi otomatis berdasarkan tinggi
// nav + mobile search agar category-nav tidak overlap elemen lain.
// ============================================================
function updateCategoryNavTop() {
    const nav          = document.querySelector('nav');
    const mobileSearch = document.getElementById('mobile-search-bar');
    const catNav       = document.getElementById('category-nav');
    if (!catNav || !nav) return;

    const navHeight    = nav.getBoundingClientRect().height;
    const isMobile     = window.innerWidth < 768;
    const searchHeight = (isMobile && mobileSearch)
        ? mobileSearch.getBoundingClientRect().height
        : 0;

    catNav.style.top = `${Math.ceil(navHeight + searchHeight)}px`;
}

// --- Event Handlers ---
function initEvents() {
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
            if (typeof paypalButtonsInstance !== 'undefined' && paypalButtonsInstance) {
                try { paypalButtonsInstance.close(); } catch (e) { console.warn('PayPal close error:', e); }
                paypalButtonsInstance = null;
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
                if (typeof paypalButtonsInstance !== 'undefined' && paypalButtonsInstance) {
                    try { paypalButtonsInstance.close(); } catch (_) {}
                    paypalButtonsInstance = null;
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

// --- PayPal Integration ---
let paypalButtonsInstance = null;

// Guard: jika SDK belum load (defer script), retry hingga 3x
function initPayPalPurchase(packKey, price) {
    if (!window.paypal) {
        let retries = 0;
        const waitForSdk = setInterval(() => {
            retries++;
            if (window.paypal) {
                clearInterval(waitForSdk);
                _renderPayPalButtons(packKey, price);
            } else if (retries >= 3) {
                clearInterval(waitForSdk);
                alert('❌ PayPal SDK failed to load. Please check your internet connection and refresh the page.');
            }
        }, 800);
        return;
    }
    _renderPayPalButtons(packKey, price);
}

function _renderPayPalButtons(packKey, price) {
    if (paypalButtonsInstance) {
        try { paypalButtonsInstance.close(); } catch (e) { console.warn('Error closing previous PayPal instance:', e); }
        paypalButtonsInstance = null;
    }

    if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.remove('hidden');
    if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';

    try {
        paypalButtonsInstance = paypal.Buttons({
            style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'paypal' },

            createOrder: (data, actions) => {
                const token = getOrCreateUserToken();
                return actions.order.create({
                    purchase_units: [{
                        description: `ZXAION Credits: ${packKey}`,
                        custom_id:   token,
                        amount:      { currency_code: 'USD', value: price.toString() }
                    }]
                });
            },

            onApprove: async (data, actions) => {
                let capturedOrderId = null;
                try {
                    const order     = await actions.order.capture();
                    capturedOrderId = order.id;

                    let result      = null;
                    let retryCount  = 0;
                    const maxRetries = 3;

                    while (retryCount < maxRetries) {
                        try {
                            result = await api.purchaseCredits(packKey, capturedOrderId);
                            if (result.success) break;
                            retryCount++;
                            if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 2000 * retryCount));
                        } catch (e) {
                            retryCount++;
                            console.error(`Attempt ${retryCount} network error:`, e);
                            if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 2000 * retryCount));
                        }
                    }

                    if (result && result.success) {
                        state.credits  = result.newBalance;
                        state.lifetime = result.lifetime || false;
                        ui.updateCreditDisplay();
                        await api.fetchCreditBalance();
                        api.invalidateCache();

                        alert(state.lifetime
                            ? '✅ Lifetime Access Activated!\n\nEnjoy unlimited downloads on DTREASURE collection.'
                            : `✅ Purchase Successful!\n\nYou now have ${result.newBalance} credits.`
                        );

                        const buyCreditsModal = document.getElementById('buy-credits-modal');
                        if (buyCreditsModal) { buyCreditsModal.classList.add('hidden'); buyCreditsModal.classList.remove('flex'); }
                        document.body.style.overflow = '';
                        if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
                        if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
                        paypalButtonsInstance = null;

                        if (state.currentCategory === 'DTREASURE') ui.renderDtreasureGallery();

                    } else {
                        const errMsg  = result?.error || 'Credits could not be applied automatically';
                        const orderId = result?.orderId || capturedOrderId;
                        alert(
                            `⚠️ Payment Received But Auto-Credit Failed\n\n` +
                            `Order ID: ${orderId}\n\n` +
                            `Email zxaionxl@gmail.com with Order ID above.\n` +
                            `Credits will be added within 24 hours.`
                        );
                    }
                } catch (error) {
                    console.error('PayPal onApprove error:', error);
                    alert(`❌ Payment Processing Error${capturedOrderId ? '\n\nOrder ID: ' + capturedOrderId : ''}\n\n${error.message || 'An unexpected error occurred.'}`);
                }
            },

            onError:  (err) => { console.error('PayPal error:', err); alert('❌ PayPal error. Please try again.'); },
            onCancel: ()    => { console.log('User cancelled payment'); }
        });

        if (elements.paypalButtons) {
            paypalButtonsInstance.render('#paypal-buttons').catch(error => {
                console.error('PayPal render error:', error);
                alert('❌ Failed to load PayPal. Please refresh the page.');
                paypalButtonsInstance = null;
            });
        }
    } catch (error) {
        console.error('Error initializing PayPal:', error);
        alert('❌ Failed to initialize PayPal. Please try again.');
        paypalButtonsInstance = null;
    }
}

// --- Global Functions ---
window.refreshImages = async () => {
    ui.hideEmptyState();
    const success = await api.fetchImages();
    if (success) ui.changeCategory(state.currentCategory);
};

window.changeCategory    = (category)    => ui.changeCategory(category);
window.openAnimeCollection = (albumTitle) => ui.openAnimeAlbum(albumTitle);

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    ui.initLogo();
    ui.initIcons();
    initEvents();

    // Dynamic sticky top — kalkulasi saat load dan saat resize
    updateCategoryNavTop();
    const _resizeObserver = new ResizeObserver(() => updateCategoryNavTop());
    const _navEl          = document.querySelector('nav');
    const _searchEl       = document.getElementById('mobile-search-bar');
    if (_navEl)    _resizeObserver.observe(_navEl);
    if (_searchEl) _resizeObserver.observe(_searchEl);

    // Fetch semua data paralel — maksimalkan performa awal
    await Promise.all([
        api.fetchCreditBalance(),
        api.fetchImages(),
        api.fetchComitbaseImages(),
        api.fetchDtreasureImages(),
    ]);

    ui.changeCategory('All');
    ads.initStaticSlots();

    // Sticky nav shadow on scroll
    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        nav?.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });

    // Carousel scroll buttons
    const rankingCarousel = document.getElementById('ranking-carousel');
    document.getElementById('carousel-scroll-left')?.addEventListener('click', () => {
        rankingCarousel?.scrollBy({ left: -420, behavior: 'smooth' });
    });
    document.getElementById('carousel-scroll-right')?.addEventListener('click', () => {
        rankingCarousel?.scrollBy({ left: 420, behavior: 'smooth' });
    });

    // Mouse drag-to-scroll untuk carousel desktop
    if (rankingCarousel) {
        let isDragging   = false;
        let startX       = 0;
        let scrollLeftAt = 0;

        rankingCarousel.addEventListener('mousedown', (e) => {
            isDragging   = true;
            startX       = e.pageX - rankingCarousel.offsetLeft;
            scrollLeftAt = rankingCarousel.scrollLeft;
            rankingCarousel.style.userSelect = 'none';
        });

        const stopDrag = () => { isDragging = false; rankingCarousel.style.removeProperty('user-select'); };
        rankingCarousel.addEventListener('mouseleave', stopDrag);
        rankingCarousel.addEventListener('mouseup',    stopDrag);
        rankingCarousel.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            rankingCarousel.scrollLeft = scrollLeftAt - ((e.pageX - rankingCarousel.offsetLeft) - startX) * 1.5;
        });
    }
});
