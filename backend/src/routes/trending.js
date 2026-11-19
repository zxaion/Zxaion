/** GET /api/trending */
export async function handleTrending({ url, DB, corsHeaders }) {
      const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10);
      const limit    = Math.min(50, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));

      try {
        const { results } = await DB.prepare(`
          SELECT id, title, r2_key, bucket, category, sub_category,
                 view_count, download_count,
                 (COALESCE(view_count, 0) + COALESCE(download_count, 0)) AS score
          FROM images
          WHERE bucket = 'main'
            AND category != 'Header'
          ORDER BY score DESC, uploaded DESC
          LIMIT ?
        `).bind(limit).all();

        const photos = results.map(row => ({
          id:            row.id,
          title:         row.title,
          category:      row.category,
          subCategory:   row.sub_category,
          url:           `/api/img/${encodeURIComponent(row.r2_key)}`,
          viewCount:     row.view_count     || 0,
          downloadCount: row.download_count || 0,
          score:         row.score          || 0,
        }));

        return new Response(JSON.stringify(photos), {
          headers: {
            ...corsHeaders,
            'Content-Type':  'application/json',
            'Cache-Control': 'public, max-age=120',
          },
        });
      } catch (e) {
        console.error('/api/trending error:', e.message);
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
}
