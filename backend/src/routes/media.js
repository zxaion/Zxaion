import { resolveAllowedOrigin } from '../utils/cors.js';
import { parseTransformOptions, applyImageTransform } from '../services/imageTransform.js';

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function isUserAuthorizedForDtreasure(DB, userId, key, photoIdFromQuery) {
  if (!userId || userId === 'anonymous') return false;
  const userRecord = await DB.prepare(
    'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
  ).bind(userId).first();

  if (userRecord && !!userRecord.lifetime) return true;

  const candidateIds = [photoIdFromQuery, `dtreasure:${key}`, key].filter(Boolean);
  for (const candidateId of candidateIds) {
    const purchased = await DB.prepare(
      'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
    ).bind(userId, candidateId).first();
    if (purchased) return true;
  }
  return false;
}

// ================================================================
// ENDPOINT: Serve images dari R2 (main, comitbase, dtreasure) + Cloudflare Images transform
// ================================================================
export async function handleServeImage({ request, url, path, mainBucket, comitbaseBucket, treasureBucket, DB, IMAGES, origin, corsHeaders, getUserToken }) {
  const isDtreasure = path.startsWith('/api/dtreasure/img/');

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

  const key = safeDecode(path.slice(prefix.length));
  if (!key) {
    return new Response(JSON.stringify({ error: 'Invalid image path' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!bucket) {
    return new Response(JSON.stringify({ error: 'Storage bucket not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const headerToken      = getUserToken(request);
  const userId           = (headerToken && headerToken !== 'anonymous')
    ? headerToken
    : (url.searchParams.get('userToken') || 'anonymous');
  const photoIdFromQuery = url.searchParams.get('photoId');
  const isDownload       = url.searchParams.get('download') === 'true';

  let authorizedDtreasure = false;

  if (isDtreasure) {
    if (isDownload && (!userId || userId === 'anonymous')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (userId && userId !== 'anonymous') {
      try {
        authorizedDtreasure = await isUserAuthorizedForDtreasure(DB, userId, key, photoIdFromQuery);
      } catch (e) {
        console.error('[DTREASURE] Auth check DB error:', e.message);
        if (isDownload) {
          return new Response(JSON.stringify({ error: 'Server error during authorization check' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    if (isDownload && !authorizedDtreasure) {
      return new Response(JSON.stringify({ error: 'Purchase required to download this image' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    // For unpurchased DTREASURE previews, prefer _preview/<key> if present in R2
    let fetchedKey = key;
    let object = null;
    if (isDtreasure && !authorizedDtreasure) {
      object = await bucket.get(`_preview/${key}`);
      if (object) fetchedKey = `_preview/${key}`;
    }
    if (!object) {
      fetchedKey = key;
      object = await bucket.get(key);
    }
    if (!object) return new Response('Not found', { status: 404, headers: corsHeaders });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', resolveAllowedOrigin(origin));
    headers.set('Vary', 'Accept, Origin');
    headers.set('Cache-Control',
      isDtreasure ? 'private, no-store' : 'public, max-age=31536000, immutable');

    let transformOpts = !isDownload
      ? parseTransformOptions(url.searchParams, request.headers.get('Accept') || '')
      : null;

    // Batasi resolusi preview DTREASURE yang belum dibeli agar tidak bisa di-scrape resolusi penuh
    if (isDtreasure && !authorizedDtreasure && transformOpts) {
      transformOpts = {
        ...transformOpts,
        width:   transformOpts.width ? Math.min(transformOpts.width, 600) : 600,
        height:  transformOpts.height ? Math.min(transformOpts.height, 900) : null,
        quality: Math.min(transformOpts.quality, 75),
      };
    }

    if (IMAGES && transformOpts && request.method !== 'HEAD') {
      try {
        const sourceContentType = headers.get('Content-Type') || object.httpMetadata?.contentType || '';
        const transformed = await applyImageTransform({
          IMAGES,
          object,
          contentType: sourceContentType,
          transformOpts,
        });

        if (transformed && transformed.ok) {
          const transformedType = transformed.headers.get('Content-Type');
          if (transformedType) headers.set('Content-Type', transformedType);
          headers.set('X-Image-Transformed', 'cf-images');
          return new Response(transformed.body, { headers });
        }
      } catch (transformErr) {
        console.warn('[IMAGES] Transform failed, falling back to original:', transformErr.message);
        // Re-fetch object karena stream body sebelumnya sudah terkonsumsi oleh IMAGES.input()
        object = await bucket.get(fetchedKey);
        if (!object) return new Response('Not found', { status: 404, headers: corsHeaders });
      }
    }

    if (isDownload) {
      const rawFilename     = key.split('/').pop();
      const asciiFilename   = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const encodedFilename = encodeURIComponent(rawFilename);
      headers.set(
        'Content-Disposition',
        `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
      );
    }

    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  } catch (e) {
    console.error('Image serve error:', e.message);
    return new Response(JSON.stringify({ error: 'Failed to fetch image' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
