/** path.startsWith('/api/view/') && method === 'POST' */
export async function handleRecordView({ path, request, ctx, DB, getUserToken, checkRateLimit, corsHeaders }) {
      const rawSegment = path.split('/').filter(Boolean).pop() || '';
      const photoId    = decodeURIComponent(rawSegment);
      if (!photoId) {
        return new Response(null, { status: 400, headers: corsHeaders });
      }
      const userId = getUserToken(request);
      if (!await checkRateLimit('view', userId, 100, 3600)) {
        return new Response(null, { status: 429, headers: corsHeaders });
      }

      ctx.waitUntil(
        DB.batch([
          DB.prepare(
            'UPDATE images SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
          ).bind(photoId),
          DB.prepare(
            'INSERT OR IGNORE INTO views (photo_id, user_id) VALUES (?, ?)'
          ).bind(photoId, userId),
        ]).catch(e => console.error('[view] DB batch error:', e.message))
      );

      return new Response(null, { status: 204, headers: corsHeaders });
}

/** path.startsWith('/api/download/') && method === 'POST' */
export async function handleRecordDownload({ path, request, ctx, DB, getUserToken, checkRateLimit, corsHeaders }) {
      const rawSegment = path.split('/').filter(Boolean).pop() || '';
      const photoId    = decodeURIComponent(rawSegment);
      if (!photoId) {
        return new Response(null, { status: 400, headers: corsHeaders });
      }
      const userId = getUserToken(request);
      if (!await checkRateLimit('download', userId, 50, 3600)) {
        return new Response(null, { status: 429, headers: corsHeaders });
      }

      ctx.waitUntil(
        DB.batch([
          DB.prepare(
            'UPDATE images SET download_count = COALESCE(download_count, 0) + 1 WHERE id = ?'
          ).bind(photoId),
          DB.prepare(
            'INSERT OR IGNORE INTO downloads (photo_id, user_id) VALUES (?, ?)'
          ).bind(photoId, userId),
        ]).catch(e => console.error('[download] DB batch error:', e.message))
      );

      return new Response(null, { status: 204, headers: corsHeaders });
}

/** path === '/api/credits/balance' && method === 'GET' */
export async function handleCreditBalance({ request, DB, getUserToken, corsHeaders }) {
      const userId = getUserToken(request);

      if (!userId || userId === 'anonymous') {
        return new Response(
          JSON.stringify({ credits: 0, lifetime: false, purchased: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        let user = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();

        if (!user) {
          user = { credits: 0, lifetime: 0 };
          // FIX: INSERT OR IGNORE — idempotent, cegah error UNIQUE constraint
          // kalau ada 2 request bersamaan dari user baru yang sama.
          await DB.prepare(
            'INSERT OR IGNORE INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 0)'
          ).bind(userId).run();
        }

        const purchasedRows = await DB.prepare(
          'SELECT photo_id FROM purchased_images WHERE user_id = ? LIMIT 1000'
        ).bind(userId).all();
        const purchased = purchasedRows.results.map(r => r.photo_id);

        return new Response(
          JSON.stringify({ credits: user.credits, lifetime: !!user.lifetime, purchased }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('/api/credits/balance error:', e.message);
        return new Response(
          JSON.stringify({ credits: 0, lifetime: false, purchased: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
}
