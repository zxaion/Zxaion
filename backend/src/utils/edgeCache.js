// Helper Cloudflare Cache API (`caches.default`) untuk list & gambar publik.
// Aman dipakai di Node.js / local dev karena otomatis no-op jika `caches.default` tidak tersedia.

export function getDefaultEdgeCache() {
  try {
    if (typeof caches !== 'undefined' && caches && caches.default) {
      return caches.default;
    }
  } catch {
    // Abaikan di runtime non-Worker
  }
  return null;
}

export async function matchEdgeCache(request) {
  const cache = getDefaultEdgeCache();
  if (!cache || request.method !== 'GET') return null;
  try {
    return await cache.match(request);
  } catch {
    return null;
  }
}

export function storeEdgeCache(request, response, ctx) {
  const cache = getDefaultEdgeCache();
  if (!cache || request.method !== 'GET' || !response || response.status !== 200) return;
  const cacheControl = response.headers.get('Cache-Control') || '';
  if (!cacheControl || cacheControl.includes('no-store') || cacheControl.includes('private')) return;

  try {
    const putPromise = cache.put(request, response.clone()).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(putPromise);
    }
  } catch {
    // Abaikan error Cache API
  }
}
