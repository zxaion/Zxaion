/**
 * ui/modal.js — Image modal: shield proteksi DTREASURE, unlock thumbnail, buka modal gambar.
 * Depends on: ui (base.js), state, elements, api, utils, preventTouchSave
 */
Object.assign(ui, {
    applyModalShield(protect) {
        const shield = document.getElementById('modal-img-shield');
        const img    = elements.modalImg;
        if (!shield || !img) return;

        if (protect) {
            shield.classList.remove('hidden');
            img.oncontextmenu = (e) => e.preventDefault();
            img.ondragstart   = (e) => e.preventDefault();
            img.addEventListener('touchstart', preventTouchSave, { passive: false });
        } else {
            shield.classList.add('hidden');
            img.oncontextmenu = null;
            img.ondragstart   = null;
            img.removeEventListener('touchstart', preventTouchSave);
        }
    },

    unlockDtreasureThumbnail(photoId) {
        if (!photoId) return;
        const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(photoId) : photoId;
        const photo = typeof this.findPhotoById === 'function' ? this.findPhotoById(photoId) : null;
        const errorSvg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="16" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage Error%3C/text%3E%3C/svg%3E';

        [elements.dtreasureGallery, elements.galleryContainer].forEach(container => {
            const item = container?.querySelector(`.masonry-item[data-photo-id="${safeId}"]`);
            if (!item) return;

            const shield = item.querySelector('.dtreasure-thumb-shield');
            if (shield) shield.remove();

            const thumbWrap = item.querySelector('.relative');
            if (thumbWrap && !thumbWrap.querySelector('.dtreasure-unlocked-badge')) {
                const badge = document.createElement('span');
                badge.className = 'dtreasure-unlocked-badge absolute top-2.5 left-2.5 z-[2] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[10px] font-black uppercase tracking-wider shadow-md backdrop-blur-sm';
                badge.innerHTML = '<i class="fas fa-unlock"></i> Unlocked';
                thumbWrap.prepend(badge);
            }

            const img = item.querySelector('img');
            if (img) {
                img.oncontextmenu = null;
                img.ondragstart   = null;
                img.removeEventListener('touchstart', preventTouchSave);
                img.style.removeProperty('-webkit-touch-callout');

                if (photo && photo.url && typeof utils.loadAuthenticatedImage === 'function') {
                    img._lazyLoadFn = null;
                    delete img.dataset.src;
                    img.classList.add('loading-shimmer');
                    utils.loadAuthenticatedImage(img, photo.url, { w: 700, q: 82, fit: 'scale-down', fmt: 'auto' }, {
                        fallbackSvg: errorSvg,
                        onLoadSuccess(el) {
                            el.classList.remove('loading-shimmer');
                            ui.recordPhotoDimensions?.(photo, el);
                        },
                        onFinalError(el) {
                            el.classList.remove('loading-shimmer');
                            el.src = errorSvg;
                        },
                    });
                }
            }

            const btn = item.querySelector('.download-btn');
            if (btn) btn.innerHTML = '<i class="fas fa-download"></i> Download';
        });

        if (state.currentImageId === photoId && state.currentPhoto) {
            this.refreshModalLockState(state.currentPhoto);
        }
    },

    loadModalPreviewImage(photo, { isDtreasure, isPurchased }) {
        if (!elements.modalImg || !photo) return;
        const targetPhotoId = photo.id;
        const modalErrorSvg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%231f2937" width="400" height="300"/%3E%3Ctext fill="%236b7280" font-family="sans-serif" font-size="18" font-weight="bold" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage unavailable%3C/text%3E%3C/svg%3E';

        elements.modalImg.classList.add('loading-shimmer');
        elements.modalImg.style.minHeight = '200px';
        elements.modalImg.onerror         = null;
        elements.modalImg.onload          = null;

        if (isDtreasure && isPurchased && typeof utils.loadAuthenticatedImage === 'function') {
            utils.loadAuthenticatedImage(
                elements.modalImg,
                photo.url,
                { w: 1400, q: 85, fit: 'scale-down', fmt: 'auto' },
                {
                    fallbackSvg: modalErrorSvg,
                    onLoadSuccess(el) {
                        if (state.currentImageId !== targetPhotoId) return;
                        el.classList.remove('loading-shimmer');
                        el.style.minHeight = '';
                        el.onload = null;
                        el.onerror = null;
                    },
                    onFinalError(el) {
                        if (state.currentImageId !== targetPhotoId) return;
                        el.classList.remove('loading-shimmer');
                        el.style.minHeight = '';
                        el.src = modalErrorSvg;
                        el.onload = null;
                        el.onerror = null;
                    },
                }
            );
            return;
        }

        const previewCandidates = utils.getImageFallbackCandidates(photo.url, {
            w:   isDtreasure ? 600 : 1400,
            q:   isDtreasure ? 75  : 85,
            fit: 'scale-down',
            fmt: 'auto',
        });

        const firstPreviewUrl = utils.attachImageFallback(elements.modalImg, previewCandidates, {
            onLoadSuccess(el) {
                if (state.currentImageId !== targetPhotoId) return;
                el.classList.remove('loading-shimmer');
                el.style.minHeight = '';
                el.onload = null;
                el.onerror = null;
            },
            onFinalError(el) {
                if (state.currentImageId !== targetPhotoId) return;
                el.classList.remove('loading-shimmer');
                el.style.minHeight = '';
                el.src = modalErrorSvg;
                el.onload = null;
                el.onerror = null;
            },
        });
        elements.modalImg.src = firstPreviewUrl;
    },

    refreshModalLockState(photo) {
        if (!photo || state.currentImageId !== photo.id) return;
        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
        if (!isDtreasure) return;
        const isPurchased = state.lifetime || state.purchasedImages.has(photo.id);

        this.applyModalShield(!isPurchased);

        if (isPurchased) {
            if (elements.downloadBtn) {
                elements.downloadBtn.removeAttribute('href');
                elements.downloadBtn.removeAttribute('download');
                elements.downloadBtn.onclick = (e) => {
                    e.preventDefault();
                    ui.triggerDownload(photo);
                };
                elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
            }
            if (typeof this.selectResolution === 'function') {
                this.selectResolution(state.selectedResolution || 'original');
            }
            this.loadModalPreviewImage(photo, { isDtreasure: true, isPurchased: true });
        }
    },

    closeImageModal(syncHash = true) {
        if (elements.imageModal) {
            elements.imageModal.classList.add('hidden');
            elements.imageModal.classList.remove('flex');
        }
        if (elements.modalImg) {
            utils.revokeTrackedBlobUrl?.(elements.modalImg);
        }
        document.body.style.overflow = '';
        state.currentImageId = null;
        state.currentPhoto = null;
        this.restoreDefaultSocialMeta();

        if (syncHash && (window.location.hash.startsWith('#photo=') || window.location.search.includes('photo='))) {
            try {
                history.replaceState(null, '', window.location.pathname);
            } catch (e) {
                console.warn('Could not reset history hash:', e);
            }
        }
    },

    updateDynamicSocialMeta(photo) {
        if (!photo) return;
        const title = photo.title ? `${photo.title} — ZXAION GALLERY` : 'ZXAION GALLERY';
        const pageTitle = photo.title ? `${photo.title} — 4K Wallpaper | ZXAION GALLERY` : 'ZXAION GALLERY';
        const category = photo.category || photo.subCategory || 'Wallpaper';
        const desc = `Download 4K "${photo.title || 'Artwork'}" (${category}) wallpaper on ZXAION GALLERY. High resolution for desktop & smartphone.`;
        const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
        const imageUrl = utils.encodeImageUrlPath(photo.url || '');
        const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${origin}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
        const canonicalUrl = `${origin}/?photo=${encodeURIComponent(photo.id)}`;

        document.title = pageTitle;

        const setMeta = (attr, key, val) => {
            let el = document.querySelector(`meta[${attr}="${key}"]`);
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute(attr, key);
                document.head.appendChild(el);
            }
            el.setAttribute('content', val);
        };

        setMeta('property', 'og:title', title);
        setMeta('property', 'og:description', desc);
        setMeta('property', 'og:image', fullImageUrl);
        setMeta('property', 'og:url', canonicalUrl);
        setMeta('name', 'description', desc);
        setMeta('name', 'twitter:title', title);
        setMeta('name', 'twitter:description', desc);
        setMeta('name', 'twitter:image', fullImageUrl);

        let schemaEl = document.getElementById('zx-schema-photo');
        if (!schemaEl) {
            schemaEl = document.createElement('script');
            schemaEl.id = 'zx-schema-photo';
            schemaEl.type = 'application/ld+json';
            document.head.appendChild(schemaEl);
        }
        schemaEl.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ImageObject',
            'name': photo.title || 'Wallpaper',
            'description': desc,
            'contentUrl': fullImageUrl,
            'thumbnailUrl': fullImageUrl,
            'acquireLicensePage': canonicalUrl,
        }, null, 2);
    },

    restoreDefaultSocialMeta() {
        document.title = 'ZXAION GALLERY';
        const defaultDesc = 'ZXAION GALLERY — Curated 4K anime, fantasy, abstract, photography wallpapers, COMITBASE community art, and exclusive DTREASURE vault editions.';
        const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
        const defaultImage = `${origin}/api/img/HEADER/Logo.png`;

        const setMeta = (attr, key, val) => {
            const el = document.querySelector(`meta[${attr}="${key}"]`);
            if (el) el.setAttribute('content', val);
        };

        setMeta('property', 'og:title', 'ZXAION GALLERY');
        setMeta('property', 'og:description', 'Curated 4K wallpapers, anime collections, community art, and exclusive DTREASURE digital vault editions.');
        setMeta('property', 'og:image', defaultImage);
        setMeta('name', 'description', defaultDesc);
        setMeta('name', 'twitter:title', 'ZXAION GALLERY');
        setMeta('name', 'twitter:description', defaultDesc);
        setMeta('name', 'twitter:image', defaultImage);

        const schemaEl = document.getElementById('zx-schema-photo');
        if (schemaEl) schemaEl.remove();
    },

    getDeepLinkedPhotoId() {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#photo=')) {
            const raw = hash.slice(7).trim();
            try {
                return decodeURIComponent(raw);
            } catch {
                return raw;
            }
        }
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.has('photo')) {
                return params.get('photo');
            }
        } catch {}
        return null;
    },

    findPhotoById(photoId) {
        if (!photoId) return null;
        const raw = String(photoId).trim();
        let decoded = raw;
        try { decoded = decodeURIComponent(raw); } catch {}
        const matches = (p) => p && (
            p.id === raw ||
            p.id === decoded ||
            p.url === raw ||
            p.url === decoded ||
            (p.path && (p.path === raw || p.path === decoded))
        );
        return state.allPhotos?.find(matches)
            || state.comitbasePhotos?.find(matches)
            || state.dtreasurePhotos?.find(matches)
            || null;
    },

    openPhotoById(photoId) {
        const photo = this.findPhotoById(photoId);
        if (photo) {
            this.openImageModal(photo);
            return true;
        }
        return false;
    },

    checkDeepLink() {
        const photoId = this.getDeepLinkedPhotoId();
        if (!photoId) return false;
        return this.openPhotoById(photoId);
    },

    handleHashChange() {
        const photoId = this.getDeepLinkedPhotoId();
        if (photoId) {
            if (state.currentPhoto?.id !== photoId) {
                this.openPhotoById(photoId);
            }
        } else {
            if (elements.imageModal && !elements.imageModal.classList.contains('hidden')) {
                this.closeImageModal(false);
            }
        }
    },

    async sharePhoto(photo) {
        const target = photo || state.currentPhoto;
        if (!target) return;
        const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
        const shareUrl = `${origin}/?photo=${encodeURIComponent(target.id)}`;
        const title = target.title || 'ZXAION Wallpaper';

        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({
                    title: `${title} — ZXAION GALLERY`,
                    text: `Check out "${title}" wallpaper on ZXAION GALLERY!`,
                    url: shareUrl,
                });
                return;
            } catch (err) {
                if (err && err.name === 'AbortError') return;
            }
        }

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareUrl);
            } else {
                const temp = document.createElement('textarea');
                temp.value = shareUrl;
                temp.style.position = 'fixed';
                temp.style.opacity = '0';
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                document.body.removeChild(temp);
            }
            ui.showToast('Wallpaper link copied to clipboard!', 'success', 3000);
        } catch (e) {
            console.error('Share fallback copy error:', e);
            ui.showToast('Failed to copy wallpaper link.', 'error');
        }
    },

    async openImageModal(photo) {
        if (!photo) return;

        const targetPhotoId = photo.id;
        state.currentImageId = targetPhotoId;
        state.currentPhoto = photo;

        // Synchronize deep link URL hash
        const targetHash = `#photo=${encodeURIComponent(photo.id)}`;
        if (window.location.hash !== targetHash) {
            try {
                history.replaceState(null, '', targetHash);
            } catch (e) {
                console.warn('Could not update history state:', e);
            }
        }

        // Dynamic OpenGraph, Title, & Schema.org update
        this.updateDynamicSocialMeta(photo);

        // Optimistic update (in-memory + DOM + server)
        photo.viewCount = (photo.viewCount || 0) + 1;
        api.recordView(photo.id);

        const displayViews     = photo.viewCount;
        const displayDownloads = photo.downloadCount || 0;

        const imageUrl    = utils.encodeImageUrlPath(photo.url);
        const isDtreasure = photo.category === 'DTREASURE' || photo.searchCategory === 'DTREASURE';
        const isPurchased = state.lifetime || state.purchasedImages.has(photo.id);

        this.loadModalPreviewImage(photo, { isDtreasure, isPurchased });

        elements.modalTitle.textContent         = photo.title || 'Wallpaper';
        elements.modalCategory.textContent      = `${photo.category || photo.searchCategory || ''}${photo.subCategory ? ' / ' + photo.subCategory : ''}`;
        elements.modalViewCount.textContent     = utils.formatNumber(displayViews);
        elements.modalDownloadCount.textContent = utils.formatNumber(displayDownloads);

        if (typeof api.fetchImageStats === 'function') {
            api.fetchImageStats(photo.id).then(fresh => {
                if (state.currentImageId !== targetPhotoId || !fresh) return;
                const v = Math.max(photo.viewCount || 0, fresh.views || 0);
                const d = Math.max(photo.downloadCount || 0, fresh.downloads || 0);
                photo.viewCount = v;
                photo.downloadCount = d;
                if (elements.modalViewCount) elements.modalViewCount.textContent = utils.formatNumber(v);
                if (elements.modalDownloadCount) elements.modalDownloadCount.textContent = utils.formatNumber(d);
            }).catch(() => {});
        }

        this.applyModalShield(isDtreasure && !isPurchased);

        if (isDtreasure) {
            if (isPurchased) {
                // Use X-User-Token header via ui.triggerDownload instead of leaking token in URL query
                elements.downloadBtn.removeAttribute('href');
                elements.downloadBtn.removeAttribute('download');
                elements.downloadBtn.onclick = (e) => {
                    e.preventDefault();
                    ui.triggerDownload(photo);
                };
                elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
            } else {
                elements.downloadBtn.removeAttribute('href');
                elements.downloadBtn.removeAttribute('download');
                elements.downloadBtn.onclick = (e) => { e.preventDefault(); ui.handleDownload(photo); };
                elements.downloadBtn.innerHTML = '<i class="fas fa-lock mr-2"></i>10 Credits to Download';
            }
        } else {
            elements.downloadBtn.href     = imageUrl.split('?')[0] + '?download=true';
            elements.downloadBtn.download = (photo.title || 'wallpaper').replace(/[^a-z0-9_\-\.]/gi, '_');
            elements.downloadBtn.onclick  = (e) => {
                if (state.selectedResolution && state.selectedResolution !== 'original') {
                    e.preventDefault();
                    ui.triggerDownload(photo);
                    return;
                }
                photo.downloadCount = (photo.downloadCount || 0) + 1;
                api.recordDownload(photo.id);
                const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(photo.id) : photo.id;
                document.querySelectorAll(`.download-count[data-id="${safeId}"]`).forEach(el => {
                    el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
                });
                if (elements.modalDownloadCount) {
                    elements.modalDownloadCount.textContent = utils.formatNumber(photo.downloadCount);
                }
            };
            elements.downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download';
        }

        // Sync resolution selector and CTA label after downloadBtn is configured
        if (typeof this.selectResolution === 'function') {
            this.selectResolution(state.selectedResolution || 'original');
        }

        elements.imageModal.classList.remove('hidden');
        elements.imageModal.classList.add('flex');

        document.body.style.overflow = 'hidden';
    },
});
