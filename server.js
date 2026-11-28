import express from 'express';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import worker from './backend/src/index.js';
import { createLocalEnv } from './backend/src/localRuntime.js';
import { findPhotoForSeo, injectOpenGraphMetadata, injectBaseSeoOrigin, resolvePublicOrigin } from './backend/src/services/seo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, 'frontend', 'dist');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

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

  // Lightweight gzip compression for JSON, HTML, CSS, JS, and SVG payloads (>= 1 KB)
  app.use((req, res, next) => {
    const acceptEnc = String(req.headers['accept-encoding'] || '');
    if (!/\bgzip\b/i.test(acceptEnc) || req.method === 'HEAD') return next();

    const origSend = res.send.bind(res);
    res.send = (body) => {
      if (res.headersSent || res.getHeader('Content-Encoding') || !body) {
        return origSend(body);
      }
      const cType = String(res.getHeader('Content-Type') || '').toLowerCase();
      const isCompressible =
        cType.includes('text/') ||
        cType.includes('application/javascript') ||
        cType.includes('application/json') ||
        cType.includes('image/svg+xml');
      if (!isCompressible) return origSend(body);

      const rawBuf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      if (rawBuf.length < 1024) return origSend(body);

      try {
        const gz = gzipSync(rawBuf, { level: 6 });
        res.setHeader('Content-Encoding', 'gzip');
        res.removeHeader('Content-Length');
        const prevVary = res.getHeader('Vary');
        res.setHeader('Vary', prevVary ? `${prevVary}, Accept-Encoding` : 'Accept-Encoding');
        return origSend(gz);
      } catch {
        return origSend(body);
      }
    };
    next();
  });

  // Technical SEO routes (/robots.txt & /sitemap.xml) served via Worker router or built static assets
  app.get(['/robots.txt', '/sitemap.xml'], (req, res) => {
    return bridgeWorkerRequest(req, res, env);
  });

  // Collect raw request body for API routes so the Cloudflare Worker Request adapter handles JSON/text identically
  app.use('/api', express.raw({ type: '*/*', limit: '12mb' }), (req, res) => {
    return bridgeWorkerRequest(req, res, env);
  });

  // Dynamic OpenGraph & canonical origin injection for HTML pages and deep-linked photos (?photo=<id>)
  app.get(['/', '/index.html', '/admin', '/admin/'], async (req, res, next) => {
    try {
      const rawHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
      const rawProto = Array.isArray(req.headers['x-forwarded-proto'])
        ? req.headers['x-forwarded-proto'][0]
        : req.headers['x-forwarded-proto'];
      const parsedProto = String(rawProto || req.protocol || 'http').split(',')[0].trim().toLowerCase();
      const proto = parsedProto === 'https' || parsedProto === 'http' ? parsedProto : 'http';
      const reqOrigin = `${proto}://${req.get('host') || 'localhost:3000'}`;
      const publicOrigin = resolvePublicOrigin(reqOrigin, env);
      const photoId = req.query.photo;

      if (photoId && env.DB) {
        const photo = await findPhotoForSeo(env.DB, photoId);

        if (photo) {
          const transformedHtml = injectOpenGraphMetadata(rawHtml, photo, publicOrigin);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(transformedHtml);
        }
      }

      const withBaseOrigin = injectBaseSeoOrigin(rawHtml, publicOrigin);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(withBaseOrigin);
    } catch (err) {
      console.warn('[Server] OG injection error:', err.message);
      next();
    }
  });

  // Serve built frontend static assets with short revalidate cache
  app.use(express.static(DIST_DIR, { maxAge: '1h' }));

  // Return explicit 404 (no soft-404 200 index.html fallback)
  app.use((_req, res) => {
    res.status(404).sendFile(join(DIST_DIR, '404.html'));
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
