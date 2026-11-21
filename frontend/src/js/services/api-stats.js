/**
 * services/api-stats.js — Menambah api: statistik view/download dan trending.
 * Depends on: api (api-gallery.js), API_BASE, state, utils, getOrCreateUserToken
 */
Object.assign(api, {
    async fetchImageStats(photoId) {
        if (!photoId) return { views: 0, downloads: 0 };
        try {
            const res = await fetch(`${API_BASE}/api/stats/${encodeURIComponent(photoId)}`);
            if (!res.ok) return { views: 0, downloads: 0 };
            const data = await res.json();
            return { views: data.views || 0, downloads: data.downloads || 0 };
        } catch {
            return { views: 0, downloads: 0 };
        }
    },

    async recordDownload(photoId) {
        if (!photoId) return;
        try {
            const token = getOrCreateUserToken();
            await fetch(`${API_BASE}/api/download/${encodeURIComponent(photoId)}`, {
                method:  'POST',
                headers: { 'X-User-Token': token },
            });
        } catch (error) {
            console.error('Failed to record download:', error);
        }
    },

    async recordView(photoId) {
        if (!photoId) return;
        const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(photoId) : photoId;
        document.querySelectorAll(`.view-count[data-id="${safeId}"]`).forEach(el => {
            el.textContent = utils.formatNumber(utils.parseFormattedCount(el.textContent) + 1);
        });
        try {
            const token = getOrCreateUserToken();
            await fetch(`${API_BASE}/api/view/${encodeURIComponent(photoId)}`, {
                method:  'POST',
                headers: { 'X-User-Token': token },
            });
        } catch (error) {
            console.error('Failed to record view:', error);
        }
    },

    async fetchTrendingImages(limit = 20) {
        try {
            const res  = await fetch(`${API_BASE}/api/trending?limit=${limit}`);
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error('Error fetching trending images:', e);
            return state.allPhotos
                .map(p => ({ ...p, score: (p.viewCount || 0) + (p.downloadCount || 0) }))
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
        }
    },
});
