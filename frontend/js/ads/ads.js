// frontend/js/ads/ads.js
// Integrasi slot iklan AdSense
// ============================================================
// ADS MODULE
// ============================================================
export const ads = {
    CLIENT_ID: 'ca-pub-4913648248892788',
    SLOTS: {
        BANNER_TOP: 'SLOT_ID_BANNER_TOP',
        MODAL:      'SLOT_ID_MODAL',
        CONTENT:    'SLOT_ID_CONTENT',
        IN_FEED:    'SLOT_ID_IN_FEED',
    },
    IN_FEED_INTERVAL: 10,

    push(el) {
        if (!el || el.dataset.adsbygoogleStatus) return;
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            console.warn('[AdSense] Push error:', e.message);
        }
    },

    initStaticSlots() {
        document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])').forEach(ins => {
            this.push(ins);
        });
    },

    createInFeedAd() {
        const wrapper = document.createElement('div');
        wrapper.className = 'masonry-item ad-in-feed-item';
        wrapper.setAttribute('aria-label', 'Advertisement');
        wrapper.innerHTML = `
            <div class="relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 min-h-[200px] flex flex-col">
                <span class="absolute top-2 left-2 z-10 text-[9px] text-gray-400 bg-white/80 dark:bg-gray-900/80 px-1.5 py-0.5 rounded uppercase tracking-wider">Ad</span>
                <ins class="adsbygoogle flex-1"
                     style="display:block;min-height:200px;"
                     data-ad-client="${this.CLIENT_ID}"
                     data-ad-slot="${this.SLOTS.IN_FEED}"
                     data-ad-format="fluid"
                     data-ad-layout-key="-fb+5w+4e-db+86"></ins>
            </div>
        `;
        return wrapper;
    },

    injectInFeedAds(container) {
        if (!container || !window.adsbygoogle) return;
        const items    = container.querySelectorAll('.masonry-item:not(.ad-in-feed-item)');
        const interval = this.IN_FEED_INTERVAL;
        for (let i = interval - 1; i < items.length; i += interval) {
            const adEl = this.createInFeedAd();
            items[i].insertAdjacentElement('afterend', adEl);
        }
        container.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])').forEach(ins => {
            this.push(ins);
        });
    },

    handleCategoryChange(category) {
        const bannerTop    = document.getElementById('ad-banner-top');
        const afterGallery = document.getElementById('ad-after-gallery');
        const isPremium    = category === 'DTREASURE';
        if (bannerTop)    bannerTop.classList.toggle('hidden', isPremium);
        if (afterGallery) afterGallery.classList.toggle('hidden', isPremium);
    }
};
