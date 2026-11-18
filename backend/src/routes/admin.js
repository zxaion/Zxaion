// backend/src/routes/admin.js
// Route: admin (trigger sync manual)
/** POST /api/admin/sync */
export async function handleAdminSync(c) {
  const { request, env } = c;
  const adminToken = request.headers.get('X-Admin-Token');
  if (!env.ADMIN_TOKEN || adminToken !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    await handleScheduled(env);
    return new Response(JSON.stringify({ success: true, message: 'Sync completed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
