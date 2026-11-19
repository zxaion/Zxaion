/** GET /api/stats/:id */
export async function handleImageStats({ path, DB, corsHeaders }) {
      const rawSegment = path.split('/').filter(Boolean).pop() || '';
      const photoId    = decodeURIComponent(rawSegment);
      if (!photoId) {
        return new Response(JSON.stringify({ error: 'Invalid photo ID' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const row = await DB.prepare(
          'SELECT view_count, download_count FROM images WHERE id = ?'
        ).bind(photoId).first();

        return new Response(JSON.stringify({
          views:     row?.view_count     || 0,
          downloads: row?.download_count || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        console.error('/api/stats error:', e.message);
        return new Response(JSON.stringify({ views: 0, downloads: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
}
