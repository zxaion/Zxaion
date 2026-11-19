/** R2 static asset and SPA fallback handler. */
export async function handleStaticAsset({ path, mainBucket, corsHeaders }) {    try {
      let key = path === '/' ? 'index.html' : path.slice(1);
      if (key.startsWith('api/')) return new Response('Not Found', { status: 404 });

      const ext = key.split('.').pop().toLowerCase();
      const mimeTypes = {
        html:  'text/html; charset=utf-8',
        css:   'text/css; charset=utf-8',
        js:    'application/javascript; charset=utf-8',
        json:  'application/json',
        png:   'image/png',
        jpg:   'image/jpeg',
        jpeg:  'image/jpeg',
        webp:  'image/webp',
        svg:   'image/svg+xml',
        ico:   'image/x-icon',
        woff2: 'font/woff2',
        woff:  'font/woff',
      };

      let object       = await mainBucket.get(key);
      const isFallback = !object;
      const isAsset    = ext && ext !== 'html' && mimeTypes[ext];

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
        corsHeaders['Access-Control-Allow-Origin']);
      headers.set('Vary', 'Origin');

      const servedExt = isFallback ? 'html' : ext;
      if (mimeTypes[servedExt]) headers.set('Content-Type', mimeTypes[servedExt]);

      if (servedExt === 'html') {
        headers.set('X-Frame-Options',        'DENY');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('X-XSS-Protection',       '1; mode=block');
        headers.set('Referrer-Policy',        'strict-origin-when-cross-origin');
        headers.set('Content-Security-Policy',
          "default-src 'self'; " +
          "img-src 'self' data: https: blob:; " +
          "script-src 'self' 'unsafe-inline' " +
            "https://cdn.tailwindcss.com " +
            "https://cdnjs.cloudflare.com " +
            "https://www.paypal.com " +
            "https://pagead2.googlesyndication.com " +
            "https://partner.googleadservices.com " +
            "https://tpc.googlesyndication.com " +
            "https://securepubads.g.doubleclick.net " +
            "https://www.googletagservices.com " +
            "https://www.gstatic.com " +
            "https://adservice.google.com " +
            "https://adservice.google.co.id; " +
          "style-src 'self' 'unsafe-inline' " +
            "https://cdnjs.cloudflare.com " +
            "https://fonts.googleapis.com; " +
          "font-src 'self' " +
            "https://cdnjs.cloudflare.com " +
            "https://fonts.gstatic.com; " +
          "connect-src 'self' " +
            "https://ai.zxaionverse.workers.dev " +
            "https://www.paypal.com " +
            "https://pagead2.googlesyndication.com " +
            "https://googleads.g.doubleclick.net " +
            "https://www.google.com; " +
          "frame-src " +
            "https://www.paypal.com " +
            "https://googleads.g.doubleclick.net " +
            "https://tpc.googlesyndication.com " +
            "https://www.google.com;"
        );
      }

      return new Response(object.body, { headers });
    } catch (e) {
      console.error('Static file error:', e.message);
      return new Response('Internal error', { status: 500 });
    }
}
