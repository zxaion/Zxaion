/**
 * ui/branding.js — Logo custom dan penggantian FontAwesome icon dengan gambar R2.
 * Depends on: ui (base.js), window.customLogo, window.customIcons, API_BASE
 */
Object.assign(ui, {
    initLogo() {
        if (!window.customLogo?.enabled || !window.customLogo?.url) return;

        const setupLogoImage = (imgEl, textEl, url, alt) => {
            if (!imgEl) return;
            imgEl.onerror = function() {
                this.onerror = null;
                this.classList.add('hidden');
                if (textEl) textEl.classList.remove('hidden');
                console.warn('Logo image failed to load, using text fallback');
            };
            imgEl.onload = function() {
                this.onload = null;
                if (textEl) textEl.classList.add('hidden');
            };
            imgEl.src = url;
            imgEl.alt = alt || 'Logo';
            imgEl.classList.remove('hidden');
        };

        setupLogoImage(document.getElementById('logo-image'),        document.getElementById('logo-text'),        window.customLogo.url, window.customLogo.alt);
        setupLogoImage(document.getElementById('footer-logo-image'), document.getElementById('footer-logo-text'), window.customLogo.url, window.customLogo.alt);
    },

    // Mengganti FontAwesome <i> tags dengan <img> dari R2.
    // Fallback otomatis ke FontAwesome jika gambar gagal load.
    initIcons() {
        if (!window.customIcons?.enabled || !Array.isArray(window.customIcons?.definitions)) return;

        window.customIcons.definitions.forEach(({ selector, url }) => {
            if (!selector || !url) return;
            try {
                document.querySelectorAll(selector).forEach(iconEl => {
                    const img         = document.createElement('img');
                    img.src           = `${API_BASE}/api/img/${url}`;
                    img.alt           = '';
                    img.width         = 20;
                    img.height        = 20;
                    img.style.cssText = 'object-fit:contain;display:inline-block;vertical-align:middle;pointer-events:none;';

                    img.onerror = () => { img.remove(); iconEl.style.display = ''; };
                    img.onload  = () => { iconEl.style.display = 'none'; };

                    iconEl.parentNode.insertBefore(img, iconEl);
                });
            } catch (e) {
                console.warn('[initIcons] Selector error:', selector, e.message);
            }
        });
    },
});
