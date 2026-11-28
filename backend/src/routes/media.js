import { resolveAllowedOrigin } from '../utils/cors.js';
import { parseTransformOptions, buildCfImageOptions } from '../services/imageTransform.js';
import { matchEdgeCache, storeEdgeCache } from '../utils/edgeCache.js';
import { resolveSessionAuth } from '../services/accountAuth.js';
import { verifyDtreasureDownloadToken } from '../services/downloadToken.js';

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

export async function isUserAuthorizedForDtreasure(DB, userId, key) {
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
// ENDPOINT: Serve images dari R2 (main, comitbase, dtreasure) + cf.image transform (max 3 presets)
// ================================================================
export async function handleServeImage({
  request,
  ctx,
  url,
  path,
  env = {},
  mainBucket,
  comitbaseBucket,
  treasureBucket,
  DB,
  origin,
  corsHeaders,
  getUserToken,
  fetchFn = typeof fetch === 'function' ? fetch : null,
}) {
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

  const isDownload = url.searchParams.get('download') === 'true';
  const acceptHeader = request.headers.get('Accept') || '';
  const isResizerSubrequest =
    url.searchParams.get('raw') === '1' ||
    String(request.headers.get('Via') || '').toLowerCase().includes('image-resizing');

  const parsedTransform = !isDownload && !isResizerSubrequest
    ? parseTransformOptions(url.searchParams, acceptHeader)
    : null;

  if (parsedTransform?.error) {
    return new Response(JSON.stringify({ error: parsedTransform.error }), {
      status: parsedTransform.status || 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let userId = 'anonymous';
  if (isDtreasure) {
    const auth = await resolveSessionAuth({ request, DB, getUserToken, ctx });
    userId = auth.authenticated ? auth.userId : 'anonymous';
  }

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

    if (isDownload) {
      if (!authorizedDtreasure) {
        return new Response(JSON.stringify({ error: 'Purchase required to download this image' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const downloadToken = url.searchParams.get('dt_token') || request.headers.get('X-Download-Token') || '';
      const tokenCheck = await verifyDtreasureDownloadToken({
        env,
        token: downloadToken,
        photoId: `dtreasure:${key}`,
        key,
        userId,
      });
      if (!tokenCheck.valid) {
        return new Response(JSON.stringify({
          error: 'Valid signed download token required for DTREASURE 4K download',
          reason: tokenCheck.reason,
        }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  }

  try {
    // For unpurchased DTREASURE previews, prefer dedicated watermarked _preview/<key> in R2
    let object = null;
    let usingPreviewAsset = false;

    if (isDtreasure && !authorizedDtreasure) {
      const previewKey = key.startsWith('_preview/') ? key : `_preview/${key}`;
      object = await bucket.get(previewKey);
      if (object) {
        usingPreviewAsset = true;
      }
    }

    if (!object) {
      object = await bucket.get(key);
    }
    if (!object) return new Response('Not found', { status: 404, headers: corsHeaders });

    // Fail-closed: never leak unwatermarked full-res original bytes for unpurchased DTREASURE
    if (isDtreasure && !authorizedDtreasure && !usingPreviewAsset && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Preview not available; purchase required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cacheHeader = isDtreasure
      ? 'private, no-store'
      : 'public, max-age=31536000, immutable';

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (object.httpEtag) headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', resolveAllowedOrigin(origin));
    headers.set('Vary', isDtreasure ? 'Accept, Origin, Cookie, Authorization, X-User-Token' : 'Accept, Origin');
    headers.set('Cache-Control', cacheHeader);
    if (isDtreasure && !authorizedDtreasure) {
      headers.set('X-Dtreasure-Preview', 'watermarked');
    }

    const ifNoneMatch = request.headers.get('If-None-Match');
    if (!isDtreasure && !isDownload && object.httpEtag && ifNoneMatch && ifNoneMatch === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }

    // Perform edge resizing via fetch(srcUrl, { cf: { image } }) for public raster images when requested
    const sourceMime = String(headers.get('Content-Type') || object.httpMetadata?.contentType || '').toLowerCase();
    const isEdgeOrigin = url.hostname && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1';
    if (
      !isDtreasure &&
      !isDownload &&
      parsedTransform &&
      !sourceMime.includes('svg') &&
      request.method !== 'HEAD' &&
      fetchFn &&
      isEdgeOrigin
    ) {
      try {
        const cfImage = buildCfImageOptions(parsedTransform);
        const srcUrl = new URL(url.toString());
        ['w', 'width', 'h', 'height', 'q', 'quality', 'fit', 'fmt', 'format', 'blur'].forEach(p => srcUrl.searchParams.delete(p));
        srcUrl.searchParams.set('raw', '1');

        const transformed = await fetchFn(srcUrl.toString(), { cf: { image: cfImage } });
        if (transformed && transformed.ok) {
          const transformedHeaders = new Headers(headers);
          const transformedType = transformed.headers.get('Content-Type');
          if (transformedType) transformedHeaders.set('Content-Type', transformedType);
          transformedHeaders.set('X-Image-Transformed', 'cf-edge');
          const transformedRes = new Response(transformed.body, { status: 200, headers: transformedHeaders });
          storeEdgeCache(request, transformedRes, ctx);
          return transformedRes;
        }
      } catch (transformErr) {
        console.warn('[Image] cf.image transform skipped, streaming R2:', transformErr.message);
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
