/**
 * ui/branding.js — Logo custom dan penggantian FontAwesome icon dengan gambar R2.
 * Depends on: ui (base.js), window.customLogo, window.customIcons, API_BASE
 */
Object.assign(ui, {
    initLogo() {
        if (!window.customLogo?.enabled || !window.customLogo?.url) return;

        const setupLogoImage = (imgEl, textEl, url, alt, fallbackUrl) => {
            if (!imgEl) return;
            const resolvedUrl = typeof utils !== 'undefined' ? utils.encodeImageUrlPath(url) : url;
            const resolvedFallback = fallbackUrl
                ? (typeof utils !== 'undefined' ? utils.encodeImageUrlPath(fallbackUrl) : fallbackUrl)
                : (imgEl.dataset?.fallbackSrc || '');
            let triedFallback = false;

            imgEl.onerror = function() {
                if (!triedFallback && resolvedFallback && this.src !== resolvedFallback) {
                    triedFallback = true;
                    this.src = resolvedFallback;
                    return;
                }
                this.onerror = null;
                this.classList.add('hidden');
                if (textEl) textEl.classList.remove('hidden');
                console.warn('Logo image failed to load, using text fallback');
            };
            imgEl.onload = function() {
                this.onload = null;
                if (textEl) textEl.classList.add('hidden');
            };
            imgEl.src = resolvedUrl;
            imgEl.alt = alt || 'Logo';
            imgEl.classList.remove('hidden');
        };

        setupLogoImage(document.getElementById('logo-image'),        document.getElementById('logo-text'),        window.customLogo.url, window.customLogo.alt, window.customLogo.fallbackUrl);
        setupLogoImage(document.getElementById('footer-logo-image'), document.getElementById('footer-logo-text'), window.customLogo.url, window.customLogo.alt, window.customLogo.fallbackUrl);
    },

    initCategoryAndHeaderImages() {
        const catImgMap = [
            { id: 'cat-anime-img',       cat: 'Anime',       extras: ['/api/img/HEADER/Anime.jpg'] },
            { id: 'cat-fantasy-img',     cat: 'Fantasy',     extras: ['/api/img/HEADER/Fantasy.jpg'] },
            { id: 'cat-abstract-img',    cat: 'Abstract',    extras: ['/api/img/HEADER/Abstract.jpg'] },
            { id: 'cat-photography-img', cat: 'Photography', extras: ['/api/img/PHOTOGRAPHY/PSX_207.jpg'] },
            { id: 'cat-comitbase-img',   cat: 'COMITBASE',   extras: ['/api/img/HEADER/Combaseheader.jpg'] },
            { id: 'cat-dtreasure-img',   cat: 'DTREASURE',   extras: ['/api/img/HEADER/Dtreasure.jpg', '/api/img/HEADER/Dtreasure1.jpg'] },
            { id: 'cat-zmeme-img',       cat: 'ZMEME',       extras: ['/api/img/HEADER/Memenav.jpg', '/api/img/HEADER/Zmeme.jpg'] },
            { id: 'cat-overlay-img',     cat: 'OVERLAY',     extras: ['/api/img/HEADER/Overlaynav.jpg', '/api/img/HEADER/Overlay.jpg'] },
        ];

        catImgMap.forEach(({ id, cat, extras }) => {
            const img = document.getElementById(id);
            if (!img) return;
            const configured  = window.categoryThumbnails?.[cat];
            const fallbackAttr = img.dataset?.fallbackSrc || '';
            const currentAttr  = img.getAttribute('src') || '';
            const candidates   = [];
            const pushUnique   = (u) => {
                if (!u || u.startsWith('data:')) return;
                const resolved = utils.encodeImageUrlPath(u);
                if (resolved && !candidates.includes(resolved)) candidates.push(resolved);
            };
            pushUnique(configured);
            pushUnique(fallbackAttr);
            pushUnique(currentAttr);
            extras.forEach(pushUnique);

            const fallbackSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect fill='%231f2937' width='64' height='64' rx='32'/%3E%3C/svg%3E";
            const initialSrc = utils.attachImageFallback(img, candidates, { fallbackSvg });
            if (initialSrc) img.src = initialSrc;
        });

        const origImg = document.getElementById('original-album-img');
        if (origImg) {
            const fallbackAttr = origImg.dataset?.fallbackSrc || '/api/img/HEADER/Original.jpg';
            const rawOrig = window.animeAlbumThumbnails?.['ORIGINAL'] || fallbackAttr;
            const candidates = utils.getImageFallbackCandidates(
                rawOrig,
                { w: 800, q: 80, fit: 'scale-down', fmt: 'auto' },
                ['/api/img/HEADER/Original.jpg', '/api/img/HEADER/Anime.jpg']
            );
            const fallbackSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='400'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%231e1b4b'/%3E%3Cstop offset='100%25' stop-color='%23312e81'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='1200' height='400'/%3E%3C/svg%3E";
            const initialSrc = utils.attachImageFallback(origImg, candidates, { fallbackSvg });
            if (initialSrc) origImg.src = initialSrc;
        }
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
                    const rawIconPath = url.startsWith('http') || url.startsWith('/') ? url : `/api/img/${url}`;
                    img.src           = typeof utils !== 'undefined' ? utils.encodeImageUrlPath(rawIconPath) : `${API_BASE}${rawIconPath}`;
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
