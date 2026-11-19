/** GET /api/health */
export async function handleHealth({ DB, corsHeaders }) {
      try {
        await DB.prepare('SELECT 1').first();
        return new Response(JSON.stringify({ status: 'ok', db: 'connected' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ status: 'error', db: 'disconnected', message: e.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
}
