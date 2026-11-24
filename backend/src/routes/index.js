import { handleHealth }          from './health.js';
import { handleAdminSync, handleAdminRescan, handleAdminDashboard } from './admin.js';
import { handlePayPalWebhook }   from './paypalWebhook.js';
import { handleListMain, handleAnimeAlbums, handleListComitbase, handleListDtreasure, handleTrending } from './gallery.js';
import { handleStats, handleRecordView, handleRecordDownload } from './stats.js';
import { handleCreditBalance, handlePreparePayer, handleCreatePayPalOrder, handleCreateRecoveryCode, handleRecoverAccount, handleCreditPurchase, handleCreditSpend } from './credits.js';
import { handleServeImage }      from './media.js';

export const routes = [
  // --- System & Admin ---
  { method: 'GET',  path: '/api/health',          handler: handleHealth },
  { method: 'GET',  path: '/api/admin/dashboard', handler: handleAdminDashboard },
  { method: 'POST', path: '/api/admin/rescan',    handler: handleAdminRescan },
  { method: 'POST', path: '/api/admin/sync',      handler: handleAdminSync },
  { method: 'POST', path: '/api/paypal/webhook',  handler: handlePayPalWebhook },

  // --- Gallery ---
  { method: 'GET',  path: '/api/list',            handler: handleListMain },
  { method: 'GET',  path: '/api/anime/albums',    handler: handleAnimeAlbums },
  { method: 'GET',  path: '/api/comitbase/list',  handler: handleListComitbase },
  { method: 'GET',  path: '/api/dtreasure/list',  handler: handleListDtreasure },
  { method: 'GET',  path: '/api/trending',        handler: handleTrending },

  // --- Stats ---
  { method: 'GET',  pathPrefix: '/api/stats/',    handler: handleStats },
  { method: 'POST', pathPrefix: '/api/view/',     handler: handleRecordView },
  { method: 'POST', pathPrefix: '/api/download/', handler: handleRecordDownload },

  // --- Credits & Recovery ---
  { method: 'GET',  path: '/api/credits/balance',      handler: handleCreditBalance },
  { method: 'POST', path: '/api/credits/prepare',      handler: handlePreparePayer },
  { method: 'POST', path: '/api/credits/create-order', handler: handleCreatePayPalOrder },
  { method: 'POST', path: '/api/credits/recovery',     handler: handleCreateRecoveryCode },
  { method: 'POST', path: '/api/credits/recover',      handler: handleRecoverAccount },
  { method: 'POST', path: '/api/credits/purchase',     handler: handleCreditPurchase },
  { method: 'POST', path: '/api/credits/spend',        handler: handleCreditSpend },

  // --- Media (gambar dari R2) — semua method, 3 bucket ---
  {
    pathPrefixes: ['/api/img/', '/api/comitbase/img/', '/api/dtreasure/img/'],
    handler: handleServeImage,
  },
];
