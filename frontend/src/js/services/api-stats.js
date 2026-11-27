/**
 * services/api-stats.js — Menambah api: statistik view/download dan trending.
 * Depends on: api (api-gallery.js), API_BASE, state, utils, getOrCreateUserToken
 */
Object.assign(api, {
    async fetchImageStats(photoId) {
        if (!photoId) return { views: 0, downloads: 0, loves: 0, fires: 0, loved: false, fired: false };
        try {
            const headers = typeof getAuthHeaders === 'function'
                ? getAuthHeaders()
                : { 'X-User-Token': getOrCreateUserToken() };
            const res = await fetch(`${API_BASE}/api/stats/${encodeURIComponent(photoId)}`, { headers });
            if (!res.ok) return { views: 0, downloads: 0, loves: 0, fires: 0, loved: false, fired: false };
            const data = await res.json();
            return {
                views: data.views || 0,
                downloads: data.downloads || 0,
                loves: data.loves || 0,
                fires: data.fires || 0,
                loved: Boolean(data.loved),
                fired: Boolean(data.fired),
            };
        } catch {
            return { views: 0, downloads: 0, loves: 0, fires: 0, loved: false, fired: false };
        }
    },

    async toggleReaction(photoId, type = 'love') {
        if (!photoId) return { success: false };
        const reactionType = type === 'fire' ? 'fire' : 'love';
        try {
            const headers = typeof getAuthHeaders === 'function'
                ? getAuthHeaders({ 'Content-Type': 'application/json' })
                : { 'X-User-Token': getOrCreateUserToken(), 'Content-Type': 'application/json' };
            const res = await fetch(`${API_BASE}/api/react/${encodeURIComponent(photoId)}`, {
                method: 'POST',
                credentials: 'same-origin',
                headers,
                body: JSON.stringify({ type: reactionType }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
            return {
                success: true,
                type: data.type || reactionType,
                loved: Boolean(data.loved),
                fired: Boolean(data.fired),
                loveCount: Number(data.loves ?? data.loveCount ?? 0),
                fireCount: Number(data.fires ?? data.fireCount ?? 0),
            };
        } catch (err) {
            console.error('Failed to toggle reaction:', err);
            return { success: false, error: 'Network error' };
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

    async fetchTrendingImages(limit = 20, by = 'trending') {
        const allowed = new Set(['trending', 'loved', 'downloaded', 'creators']);
        const mode = allowed.has(by) ? by : 'trending';
        try {
            const res = await fetch(`${API_BASE}/api/trending?limit=${limit}&by=${encodeURIComponent(mode)}`);
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error('Error fetching trending images:', e);
            if (mode === 'creators') {
                return Array.isArray(state.comitbaseCreators) ? state.comitbaseCreators.slice(0, limit) : [];
            }
            return state.allPhotos
                .map(p => ({ ...p, score: (p.viewCount || 0) + (p.downloadCount || 0) }))
                .sort((a, b) => {
                    if (mode === 'loved') return (b.loveCount || 0) - (a.loveCount || 0);
                    if (mode === 'downloaded') return (b.downloadCount || 0) - (a.downloadCount || 0);
                    return b.score - a.score;
                })
                .slice(0, limit);
        }
    },
});
