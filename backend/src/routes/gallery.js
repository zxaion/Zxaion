/** path === '/api/list' && method === 'GET') */
export async function handleMainGallery({ url, DB, corsHeaders }) {
      try {
        const rawPage  = parseInt(url.searchParams.get('page')  ?? '1',  10);
        const rawLimit = parseInt(url.searchParams.get('limit') ?? '500', 10);
        const page     = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
        const limit    = Math.min(500, Number.isFinite(rawLimit) ? rawLimit : 500);
        const offset   = (page - 1) * limit;
        const category = url.searchParams.get('category') || null;

        let query, bindings;
        if (category && category !== 'All') {
          query    = "SELECT * FROM images WHERE bucket = 'main' AND category = ? ORDER BY uploaded DESC LIMIT ? OFFSET ?";
          bindings = [category, limit, offset];
        } else {
          query    = "SELECT * FROM images WHERE bucket = 'main' AND category != 'Header' ORDER BY uploaded DESC LIMIT ? OFFSET ?";
          bindings = [limit, offset];
        }

        const { results } = await DB.prepare(query).bind(...bindings).all();

        const photos = results.map(row => ({
          id:            row.id,
          title:         row.title,
          category:      row.category,
          subCategory:   row.sub_category,
          url:           `/api/img/${encodeURIComponent(row.r2_key)}`,
          size:          row.size,
          uploaded:      row.uploaded,
          path:          row.r2_key,
          viewCount:     row.view_count     || 0,
          downloadCount: row.download_count || 0,
        }));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        });
      } catch (e) {
        console.error('/api/list error:', e.message);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
}

/** path === '/api/comitbase/list' && method === 'GET') */
export async function handleComitbaseGallery({ url, DB, comitbaseBucket, corsHeaders }) {
      if (!comitbaseBucket) return new Response('[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      try {
        // FIX: dukungan pagination — sebelumnya hardcode LIMIT 500 tanpa OFFSET,
        // gambar ke-501 dst tidak pernah bisa diambil.
        const rawPage  = parseInt(url.searchParams.get('page')  ?? '1',   10);
        const rawLimit = parseInt(url.searchParams.get('limit') ?? '500', 10);
        const page     = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
        const limit    = Math.min(500, Number.isFinite(rawLimit) ? rawLimit : 500);
        const offset   = (page - 1) * limit;

        const { results } = await DB.prepare(
          `SELECT id, title, r2_key, uploaded, view_count, download_count
           FROM images WHERE bucket = 'comitbase'
           ORDER BY uploaded DESC LIMIT ? OFFSET ?`
        ).bind(limit, offset).all();

        const photos = results.map(row => ({
          id:            row.id,
          title:         row.title,
          uploader:      'Community',
          url:           `/api/comitbase/img/${encodeURIComponent(row.r2_key)}`,
          uploaded:      row.uploaded,
          viewCount:     row.view_count     || 0,
          downloadCount: row.download_count || 0,
        }));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        });
      } catch (e) {
        console.error('/api/comitbase/list error:', e.message);
        return new Response('[]', {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
}

/** path === '/api/dtreasure/list' && method === 'GET') */
export async function handleDtreasureGallery({ url, DB, treasureBucket, corsHeaders }) {
      if (!treasureBucket) return new Response('[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      try {
        // FIX: dukungan pagination — sama seperti /api/comitbase/list.
        const rawPage  = parseInt(url.searchParams.get('page')  ?? '1',   10);
        const rawLimit = parseInt(url.searchParams.get('limit') ?? '500', 10);
        const page     = Math.max(1,   Number.isFinite(rawPage)  ? rawPage  : 1);
        const limit    = Math.min(500, Number.isFinite(rawLimit) ? rawLimit : 500);
        const offset   = (page - 1) * limit;

        const { results } = await DB.prepare(
          `SELECT id, title, r2_key, uploaded, view_count, download_count
           FROM images WHERE bucket = 'dtreasure'
           ORDER BY uploaded DESC LIMIT ? OFFSET ?`
        ).bind(limit, offset).all();

        const photos = results.map(row => ({
          id:            row.id,
          title:         row.title,
          category:      'DTREASURE',
          url:           `/api/dtreasure/img/${encodeURIComponent(row.r2_key)}`,
          uploaded:      row.uploaded,
          viewCount:     row.view_count     || 0,
          downloadCount: row.download_count || 0,
        }));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'private, max-age=30',
          },
        });
      } catch (e) {
        console.error('/api/dtreasure/list error:', e.message);
        return new Response('[]', {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
}
