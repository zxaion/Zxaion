import { ALLOWED_ORIGINS } from '../config/constants.js';
import { MIME_TYPES } from '../config/mimeTypes.js';
import { CONTENT_SECURITY_POLICY } from '../config/security.js';
import { findPhotoForSeo, injectOpenGraphMetadata } from '../services/seo.js';

// ================================================================
// Serve static files dari R2
// ================================================================
export async function handleStatic({ path, url, mainBucket, DB, origin }) {
  try {
    let key = path === '/' ? 'index.html' : path.slice(1);
    if (key.startsWith('api/')) return new Response('Not Found', { status: 404 });

    const ext = key.split('.').pop().toLowerCase();

    let object       = await mainBucket.get(key);
    const isFallback = !object;
    const isAsset    = ext && ext !== 'html' && MIME_TYPES[ext];

    if (!object) {
      if (isAsset) {
        return new Response('Not Found', { status: 404 });
      }
      object = await mainBucket.get('index.html');
    }

    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin',
      ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
    headers.set('Vary', 'Origin');

    const servedExt = isFallback ? 'html' : ext;
    if (MIME_TYPES[servedExt]) headers.set('Content-Type', MIME_TYPES[servedExt]);

    if (servedExt === 'html') {
      headers.set('X-Frame-Options',         'DENY');
      headers.set('X-Content-Type-Options',  'nosniff');
      headers.set('X-XSS-Protection',        '1; mode=block');
      headers.set('Referrer-Policy',         'strict-origin-when-cross-origin');
      headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      headers.set('Cache-Control',           'public, max-age=60, must-revalidate');

      if (url && DB && url.searchParams.has('photo')) {
        const photoId = url.searchParams.get('photo');
        try {
          const photo = await findPhotoForSeo(DB, photoId);
          if (photo) {
            const rawBody = typeof object.text === 'function' ? await object.text() : await new Response(object.body).text();
            const transformed = injectOpenGraphMetadata(rawBody, photo, origin);
            return new Response(transformed, { headers });
          }
        } catch (e) {
          console.warn('[Static] OG transform error:', e.message);
        }
      }
    } else if (servedExt === 'css' || servedExt === 'js' || servedExt === 'json') {
      headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    } else if (servedExt === 'txt' || servedExt === 'xml') {
      headers.set('Cache-Control', 'public, max-age=3600');
    } else {
      headers.set('Cache-Control', 'public, max-age=86400');
    }

    return new Response(object.body, { headers });
  } catch (e) {
    console.error('Static file error:', e.message);
    return new Response('Internal error', { status: 500 });
  }}
