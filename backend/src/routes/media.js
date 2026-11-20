import { ALLOWED_ORIGINS } from '../config/constants.js';

// ================================================================
// ENDPOINT: Serve images dari R2 (main, comitbase, dtreasure)
// ================================================================
export async function handleServeImage({ request, url, path, mainBucket, comitbaseBucket, treasureBucket, DB, origin, corsHeaders, getUserToken }) {
  const isDtreasure = path.startsWith('/api/dtreasure/img/');

  // Auth check untuk DTREASURE download
  if (isDtreasure && url.searchParams.get('download') === 'true') {
    const headerToken = getUserToken(request);
    const userId = (headerToken && headerToken !== 'anonymous')
      ? headerToken
      : (url.searchParams.get('userToken') || 'anonymous');

    if (!userId || userId === 'anonymous') {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const userRecord = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(userId).first();

      const hasLifetime = userRecord && !!userRecord.lifetime;

      if (!hasLifetime) {
        const photoIdFromQuery = url.searchParams.get('photoId');
        const rawKey           = decodeURIComponent(path.slice('/api/dtreasure/img/'.length));

        let purchasedRecord = null;

        if (photoIdFromQuery) {
          purchasedRecord = await DB.prepare(
            'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
          ).bind(userId, photoIdFromQuery).first();
        }

        if (!purchasedRecord) {
          purchasedRecord = await DB.prepare(
            'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
          ).bind(userId, rawKey).first();
        }

        if (!purchasedRecord) {
          return new Response(JSON.stringify({ error: 'Purchase required to download this image' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } catch (e) {
      console.error('[DTREASURE Download] Auth check DB error:', e.message);
      return new Response(JSON.stringify({ error: 'Server error during authorization check' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let bucket, prefix;
  if (path.startsWith('/api/comitbase/img/')) {
    bucket = comitbaseBucket;
    prefix = '/api/comitbase/img/';
  } else if (isDtreasure) {
    bucket = treasureBucket;
    prefix = '/api/dtreasure/img/';
  } else {
    bucket = mainBucket;
    prefix = '/api/img/';
  }

  try {
    const key    = decodeURIComponent(path.slice(prefix.length));
    const object = await bucket.get(key);
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin',
      ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
    headers.set('Vary', 'Origin');
    headers.set('Cache-Control',
      isDtreasure ? 'private, no-store' : 'public, max-age=31536000, immutable');

    if (url.searchParams.get('download') === 'true') {
      const rawFilename     = key.split('/').pop();
      const asciiFilename   = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const encodedFilename = encodeURIComponent(rawFilename);
      headers.set(
        'Content-Disposition',
        `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
      );
    }

    return new Response(object.body, { headers });
  } catch (e) {
    console.error('Image serve error:', e.message);
    return new Response(JSON.stringify({ error: 'Failed to fetch image' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
