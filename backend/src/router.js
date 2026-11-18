// backend/src/router.js
// Tabel route: kondisi diambil persis dari worker.js lama

import { handleHealth } from './routes/health.js';
import { handleAdminSync } from './routes/admin.js';
import { handlePaypalWebhook } from './routes/paypalWebhook.js';
import { handleList, handleComitbaseList, handleDtreasureList, handleTrending } from './routes/gallery.js';
import { handleStats, handleView, handleDownload } from './routes/stats.js';
import { handleBalance, handlePurchase, handleSpend } from './routes/credits.js';
import { handleImage } from './routes/assets.js';
import { handleStatic } from './routes/static.js';

const routes = [
  // GET /api/health
  { name: 'handleHealth', test: (path, method) => path === '/api/health' && method === 'GET',
    handler: handleHealth },
  // POST /api/admin/sync
  { name: 'handleAdminSync', test: (path, method) => path === '/api/admin/sync' && method === 'POST',
    handler: handleAdminSync },
  // POST /api/paypal/webhook
  { name: 'handlePaypalWebhook', test: (path, method) => path === '/api/paypal/webhook' && method === 'POST',
    handler: handlePaypalWebhook },
  // GET /api/list
  { name: 'handleList', test: (path, method) => path === '/api/list' && method === 'GET',
    handler: handleList },
  // GET /api/comitbase/list
  { name: 'handleComitbaseList', test: (path, method) => path === '/api/comitbase/list' && method === 'GET',
    handler: handleComitbaseList },
  // GET /api/dtreasure/list
  { name: 'handleDtreasureList', test: (path, method) => path === '/api/dtreasure/list' && method === 'GET',
    handler: handleDtreasureList },
  // GET /api/trending
  { name: 'handleTrending', test: (path, method) => path === '/api/trending' && method === 'GET',
    handler: handleTrending },
  // GET /api/stats/:id
  { name: 'handleStats', test: (path, method) => path.startsWith('/api/stats/') && method === 'GET',
    handler: handleStats },
  // POST /api/view/:id
  { name: 'handleView', test: (path, method) => path.startsWith('/api/view/') && method === 'POST',
    handler: handleView },
  // POST /api/download/:id
  { name: 'handleDownload', test: (path, method) => path.startsWith('/api/download/') && method === 'POST',
    handler: handleDownload },
  // GET /api/credits/balance
  { name: 'handleBalance', test: (path, method) => path === '/api/credits/balance' && method === 'GET',
    handler: handleBalance },
  // POST /api/credits/purchase
  { name: 'handlePurchase', test: (path, method) => path === '/api/credits/purchase' && method === 'POST',
    handler: handlePurchase },
  // POST /api/credits/spend
  { name: 'handleSpend', test: (path, method) => path === '/api/credits/spend' && method === 'POST',
    handler: handleSpend },
  // Image proxy /api/img, /api/comitbase/img, /api/dtreasure/img
  { name: 'handleImage', test: (path, method) => path.startsWith('/api/img/') || path.startsWith('/api/comitbase/img/') || path.startsWith('/api/dtreasure/img/'),
    handler: handleImage },
];

/**
 * Mencocokkan request dengan tabel route. Urutan penting: route pertama yang cocok menang.
 * Jika tidak ada yang cocok, fallback ke serve frontend (static).
 */
export async function routeRequest(c) {
  for (const route of routes) {
    if (route.test(c.path, c.method)) return route.handler(c);
  }
  return handleStatic(c);
}
