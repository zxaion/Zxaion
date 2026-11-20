// Parsing key R2 → metadata gambar (id stabil, kategori, sub-kategori, url).
export function parseImageMeta(key, bucket) {
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const lower = key.toLowerCase();

  if (!allowedExt.some(ext => lower.endsWith(ext))) return null;

  if (lower.startsWith('_')) return null;
  if (lower.startsWith('header/') || lower.includes('/header/')) return null;

  const parts = key.split('/');
  let category = 'Other', subCategory = null;
  if (parts.length >= 2) {
    category = parts[0];
    if (parts.length > 2) subCategory = parts[1];
  }
  category = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  if (subCategory) subCategory = subCategory.toLowerCase();

  const filename = parts[parts.length - 1];
  const title = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  const urlPrefix = bucket === 'main'
    ? '/api/img/'
    : bucket === 'comitbase'
      ? '/api/comitbase/img/'
      : '/api/dtreasure/img/';

  return {
    // FIX: id stabil berbasis path (bucket:key), BUKAN content-hash (httpEtag).
    // ETag berubah setiap file di-replace di key yang sama → purchased_images/
    // views/downloads kehilangan relasinya. id berbasis path tetap konsisten
    // walau isi file diganti.
    id:           `${bucket}:${key}`,
    r2_key:       key,
    bucket,
    title,
    category,
    sub_category: subCategory,
    url:          `${urlPrefix}${encodeURIComponent(key)}`,
  };
}
