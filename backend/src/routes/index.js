// TABEL ROUTE — satu-satunya tempat yang perlu diedit untuk menambah/mengubah endpoint.
// Urutan = urutan pencocokan (sama persis dengan urutan `if` di worker.js lama).
//   method        : HTTP method (hilangkan = semua method)
//   path          : cocok persis       (path === ...)
//   pathPrefix(es): cocok awalan       (path.startsWith(...))
import { handleHealth }          from './health.js';
import { handleAdminSync }       from './admin.js';
import { handlePayPalWebhook }   from './paypalWebhook.js';
import { handleListMain, handleListComitbase, handleListDtreasure, handleTrending } from './gallery.js';
import { handleStats, handleRecordView, handleRecordDownload } from './stats.js';
import { handleCreditBalance, handleCreditPurchase, handleCreditSpend } from './credits.js';
import { handleServeImage }      from './media.js';

export const routes = [
  // --- System ---
  { method: 'GET',  path: '/api/health',          handler: handleHealth },
  { method: 'POST', path: '/api/admin/sync',      handler: handleAdminSync },
  { method: 'POST', path: '/api/paypal/webhook',  handler: handlePayPalWebhook },

  // --- Gallery ---
  { method: 'GET',  path: '/api/list',            handler: handleListMain },
  { method: 'GET',  path: '/api/comitbase/list',  handler: handleListComitbase },
  { method: 'GET',  path: '/api/dtreasure/list',  handler: handleListDtreasure },
  { method: 'GET',  path: '/api/trending',        handler: handleTrending },

  // --- Stats ---
  { method: 'GET',  pathPrefix: '/api/stats/',    handler: handleStats },
  { method: 'POST', pathPrefix: '/api/view/',     handler: handleRecordView },
  { method: 'POST', pathPrefix: '/api/download/', handler: handleRecordDownload },

  // --- Credits ---
  { method: 'GET',  path: '/api/credits/balance',  handler: handleCreditBalance },
  { method: 'POST', path: '/api/credits/purchase', handler: handleCreditPurchase },
  { method: 'POST', path: '/api/credits/spend',    handler: handleCreditSpend },

  // --- Media (gambar dari R2) — semua method, 3 bucket ---
  {
    pathPrefixes: ['/api/img/', '/api/comitbase/img/', '/api/dtreasure/img/'],
    handler: handleServeImage,
  },

  // Tidak ada yang cocok → router.js meneruskan ke handleStatic (static file R2 / SPA fallback).
];
