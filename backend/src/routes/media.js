import { resolveAllowedOrigin } from '../utils/cors.js';
import { parseTransformOptions, applyImageTransform, negotiateOutputMime } from '../services/imageTransform.js';
import { matchEdgeCache, storeEdgeCache } from '../utils/edgeCache.js';
import { resolveSessionAuth } from '../services/accountAuth.js';

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isSafeObjectKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.startsWith('/') || key.includes('..') || key.includes('\0') || key.includes('\\')) return false;
  if (key.toLowerCase().startsWith('_backups/')) return false;
  return true;
}

async function isUserAuthorizedForDtreasure(DB, userId, key) {
  if (!userId || userId === 'anonymous') return false;
  const userRecord = await DB.prepare(
    'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
  ).bind(userId).first();

  if (userRecord && !!userRecord.lifetime) return true;

  const candidateIds = [`dtreasure:${key}`, key];
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
export async function handleServeImage({ request, ctx, url, path, mainBucket, comitbaseBucket, treasureBucket, DB, IMAGES, origin, corsHeaders, getUserToken }) {
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
  if (!isSafeObjectKey(key)) {
    return new Response(JSON.stringify({ error: 'Invalid image path' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!bucket) {
    return new Response(JSON.stringify({ error: 'Storage bucket not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let userId = 'anonymous';
  if (isDtreasure) {
    const auth = await resolveSessionAuth({ request, DB, getUserToken });
    userId = auth.authenticated ? auth.userId : 'anonymous';
  }
  const isDownload = url.searchParams.get('download') === 'true';

  if (!isDtreasure && !isDownload && request.method === 'GET') {
    const cached = await matchEdgeCache(request);
    if (cached) return cached;
  }

  let authorizedDtreasure = false;

  if (isDtreasure) {
    if (isDownload && (!userId || userId === 'anonymous')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (userId && userId !== 'anonymous') {
      try {
        authorizedDtreasure = await isUserAuthorizedForDtreasure(DB, userId, key);
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
    // For unpurchased DTREASURE previews, prefer dedicated watermarked _preview/<key> in R2
    let fetchedKey = key;
    let object = null;
    let usingPreviewAsset = false;

    if (isDtreasure && !authorizedDtreasure) {
      const previewKey = key.startsWith('_preview/') ? key : `_preview/${key}`;
      object = await bucket.get(previewKey);
      if (object) {
        fetchedKey = previewKey;
        usingPreviewAsset = true;
      }
    }

    if (!object) {
      fetchedKey = key;
      object = await bucket.get(key);
    }
    if (!object) return new Response('Not found', { status: 404, headers: corsHeaders });

    const hasVersionParam = Boolean(url.searchParams.get('v'));
    const cacheHeader = isDtreasure
      ? 'private, no-store'
      : (hasVersionParam ? 'public, max-age=31536000, immutable' : 'public, max-age=3600, stale-while-revalidate=86400');

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (object.httpEtag) headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', resolveAllowedOrigin(origin));
    headers.set('Vary', isDtreasure ? 'Accept, Origin, Cookie, Authorization, X-User-Token' : 'Accept, Origin');
    headers.set('Cache-Control', cacheHeader);
    if (isDtreasure && !authorizedDtreasure) {
      headers.set('X-Dtreasure-Preview', usingPreviewAsset ? 'watermarked' : 'blurred');
    }

    const ifNoneMatch = request.headers.get('If-None-Match');
    if (!isDtreasure && !isDownload && object.httpEtag && ifNoneMatch && ifNoneMatch === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }

    const acceptHeader = request.headers.get('Accept') || '';
    let transformOpts = !isDownload
      ? parseTransformOptions(url.searchParams, acceptHeader)
      : null;

    const mustProtectOriginal = isDtreasure && !authorizedDtreasure && !usingPreviewAsset;

    // Force strict blurred low-res transform when unpurchased DTREASURE has no dedicated _preview/ asset
    if (mustProtectOriginal) {
      transformOpts = {
        width:      Math.min(transformOpts?.width || 480, 480),
        height:     transformOpts?.height ? Math.min(transformOpts.height, 720) : 720,
        quality:    Math.min(transformOpts?.quality || 60, 60),
        fit:        'scale-down',
        blur:       Math.max(transformOpts?.blur || 12, 12),
        outputMime: transformOpts?.outputMime || negotiateOutputMime('auto', acceptHeader),
      };
    } else if (isDtreasure && !authorizedDtreasure && transformOpts) {
      // Batasi resolusi preview DTREASURE yang belum dibeli agar tidak bisa di-scrape resolusi penuh
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
          const transformedRes = new Response(transformed.body, { headers });
          if (!isDtreasure && !isDownload) storeEdgeCache(request, transformedRes, ctx);
          return transformedRes;
        }
      } catch (transformErr) {
        console.warn('[IMAGES] Transform failed, falling back to original:', transformErr.message);
        if (mustProtectOriginal) {
          return new Response(JSON.stringify({ error: 'Preview not available; purchase required' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Re-fetch object karena stream body sebelumnya sudah terkonsumsi oleh IMAGES.input()
        object = await bucket.get(fetchedKey);
        if (!object) return new Response('Not found', { status: 404, headers: corsHeaders });
      }
    }

    // Fail-closed: never leak unwatermarked full-res original bytes for unpurchased DTREASURE when _preview/ & transform are unavailable
    if (mustProtectOriginal && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Preview not available; purchase required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const res = new Response(request.method === 'HEAD' ? null : object.body, { headers });
    if (!isDtreasure && !isDownload && request.method === 'GET') {
      storeEdgeCache(request, res, ctx);
    }
    return res;
  } catch (e) {
    console.error('Image serve error:', e.message);
    return new Response(JSON.stringify({ error: 'Failed to fetch image' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
