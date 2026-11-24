import express from 'express';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './backend/src/index.js';
import { createLocalEnv } from './backend/src/localRuntime.js';
import { injectOpenGraphMetadata } from './backend/src/services/seo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, 'frontend', 'dist');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const DIRECTIVE_TO_QUERY = {
  width:   'w',
  w:       'w',
  height:  'h',
  h:       'h',
  quality: 'q',
  q:       'q',
  fit:     'fit',
  format:  'fmt',
  fmt:     'fmt',
  blur:    'blur',
};

export function translateCdnCgiImagePath(originalUrl) {
  const prefix = '/cdn-cgi/image/';
  if (!originalUrl.startsWith(prefix)) return null;

  const rest = originalUrl.slice(prefix.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx <= 0) return null;

  const directivesStr = rest.slice(0, slashIdx);
  let targetRaw = rest.slice(slashIdx + 1);

  if (targetRaw.startsWith('http://') || targetRaw.startsWith('https://')) {
    try {
      const parsedTarget = new URL(targetRaw);
      targetRaw = `${parsedTarget.pathname}${parsedTarget.search}`;
    } catch {
      return null;
    }
  } else if (!targetRaw.startsWith('/')) {
    targetRaw = `/${targetRaw}`;
  }

  const targetUrl = new URL(targetRaw, 'http://localhost');
  for (const part of directivesStr.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const rawVal = part.slice(eqIdx + 1).trim();
    let val = rawVal;
    try {
      val = decodeURIComponent(rawVal);
    } catch {
      val = rawVal;
    }
    const mapped = DIRECTIVE_TO_QUERY[key];
    if (mapped && val && !targetUrl.searchParams.has(mapped)) {
      targetUrl.searchParams.set(mapped, val);
    }
  }

  return `${targetUrl.pathname}${targetUrl.search}`;
}

async function bridgeWorkerRequest(req, res, env, overridePathWithQuery = null) {
  try {
    const rawProto = Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : req.headers['x-forwarded-proto'];
    const parsedProto = String(rawProto || req.protocol || 'http').split(',')[0].trim().toLowerCase();
    const protocol = parsedProto === 'https' || parsedProto === 'http' ? parsedProto : 'http';

    const rawHost = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
    const host = String(rawHost || `localhost:${PORT}`).split(',')[0].trim() || `localhost:${PORT}`;
    const pathAndQuery = overridePathWithQuery || req.originalUrl;
    const fullUrl = `${protocol}://${host}${pathAndQuery}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || key.startsWith(':')) continue;
      try {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, String(v));
        } else {
          headers.set(key, String(value));
        }
      } catch {
        // Skip invalid proxy/hop-by-hop headers
      }
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const body = hasBody && Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : undefined;

    const webRequest = new Request(fullUrl, {
      method: req.method,
      headers,
      body,
    });

    const pendingPromises = [];
    const ctx = {
      waitUntil(promise) {
        pendingPromises.push(Promise.resolve(promise));
      },
      passThroughOnException() {},
    };

    const webResponse = await worker.fetch(webRequest, env, ctx);

    res.status(webResponse.status);
    webResponse.headers.forEach((value, key) => {
      // Allow same-origin/iframe preview in AI Studio
      if (key.toLowerCase() === 'x-frame-options') return;
      res.setHeader(key, value);
    });

    const buffer = Buffer.from(await webResponse.arrayBuffer());
    res.send(buffer);

    if (pendingPromises.length > 0) {
      Promise.allSettled(pendingPromises).catch(() => {});
    }
  } catch (err) {
    console.error('[Server] API bridge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export function createApp(env) {
  const app = express();

  // Simulasi /cdn-cgi/image/<directives>/<source> untuk preview lokal & Node runtime
  app.use('/cdn-cgi/image', (req, res, next) => {
    const translated = translateCdnCgiImagePath(req.originalUrl);
    if (!translated) return next();
    if (translated.startsWith('/api/')) {
      return bridgeWorkerRequest(req, res, env, translated);
    }
    req.url = translated;
    return express.static(DIST_DIR)(req, res, next);
  });

  // Collect raw request body for API routes so the Cloudflare Worker Request adapter handles JSON/text identically
  app.use('/api', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
    return bridgeWorkerRequest(req, res, env);
  });

  // Dynamic OpenGraph metadata injection for deep-linked photos (?photo=<id>)
  app.get(['/', '/index.html', '/admin'], async (req, res, next) => {
    const photoId = req.query.photo;
    if (!photoId || !env.DB) {
      return next();
    }
    try {
      const photo = await env.DB.prepare(
        'SELECT id, title, category, sub_category, bucket, r2_key FROM images WHERE id = ? OR r2_key = ?'
      ).bind(photoId, photoId).first();

      if (photo) {
        const rawHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
        const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
        const transformedHtml = injectOpenGraphMetadata(rawHtml, photo, origin);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(transformedHtml);
      }
    } catch (err) {
      console.warn('[Server] OG injection error:', err.message);
    }
    next();
  });

  // Serve built frontend static assets
  app.use(express.static(DIST_DIR));

  // SPA fallback (including /admin and subroutes)
  app.get('*', (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });

  return app;
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  const env = await createLocalEnv();
  const app = createApp(env);
  app.listen(PORT, HOST, () => {
    console.log(`ZXAION VERSE server running at http://${HOST}:${PORT}`);
  });
}
