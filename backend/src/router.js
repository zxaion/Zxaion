
// Dispatcher: CORS preflight → cari route yang cocok → fallback ke static file.
import { createContext } from './context.js';
import { routes } from './routes/index.js';
import { handleStatic } from './routes/static.js';

function matches(route, path, method) {
  if (route.method && route.method !== method && !(route.method === 'GET' && method === 'HEAD')) {
    return false;
  }
  if (route.path !== undefined)         return path === route.path;
  if (route.pathPrefix !== undefined)   return path.startsWith(route.pathPrefix);
  if (route.pathPrefixes !== undefined) return route.pathPrefixes.some(prefix => path.startsWith(prefix));
  return false;
}

export async function handleRequest(request, env, ctx) {
  const reqCtx = createContext(request, env, ctx);
  const { path, method, corsHeaders } = reqCtx;

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    for (const route of routes) {
      if (!matches(route, path, method)) continue;
      const response = await route.handler(reqCtx);
      if (response) {
        if (method === 'HEAD') {
          return new Response(null, { status: response.status, headers: response.headers });
        }
        return response;
      }
    }

    return await handleStatic(reqCtx);
  } catch (err) {
    console.error('Unhandled router error:', err?.message || err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
