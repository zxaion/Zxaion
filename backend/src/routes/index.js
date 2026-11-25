import { handleHealth }          from './health.js';
import {
  handleAdminSync,
  handleAdminRescan,
  handleAdminDashboard,
  handleAdminBackupList,
  handleAdminBackupCreate,
  handleAdminBackupDownload,
  handleAdminBackupRestore,
} from './admin.js';
import { handlePayPalWebhook }   from './paypalWebhook.js';
import { handleListMain, handleAnimeAlbums, handleListComitbase, handleListDtreasure, handleTrending } from './gallery.js';
import { handleStats, handleRecordView, handleRecordDownload } from './stats.js';
import { handleCreditBalance, handlePreparePayer, handleCreatePayPalOrder, handleCreateRecoveryCode, handleRecoverAccount, handleCreditPurchase, handleCreditSpend } from './credits.js';
import {
  handleAutoAccount,
  handleAccountMe,
  handleRegisterAccount,
  handleResendVerification,
  handleVerifyEmail,
  handleLoginAccount,
  handleLogoutAccount,
  handleRecoverRequest,
  handleRecoverConfirm,
  handleAccountLedger,
  handleListSessions,
  handleRevokeSession,
  handleRevokeOtherSessions,
  handleAccountExport,
} from './account.js';
import { handleServeImage }      from './media.js';
import { handleRobotsTxt, handleSitemapXml } from '../services/seo.js';

export const routes = [
  // --- Technical SEO ---
  { method: 'GET',  path: '/robots.txt',                 handler: handleRobotsTxt },
  { method: 'GET',  path: '/sitemap.xml',                handler: handleSitemapXml },

  // --- System & Admin ---
  { method: 'GET',  path: '/api/health',                 handler: handleHealth },
  { method: 'GET',  path: '/api/admin/dashboard',        handler: handleAdminDashboard },
  { method: 'POST', path: '/api/admin/rescan',           handler: handleAdminRescan },
  { method: 'POST', path: '/api/admin/sync',             handler: handleAdminSync },
  { method: 'GET',  path: '/api/admin/backup',           handler: handleAdminBackupList },
  { method: 'POST', path: '/api/admin/backup/snapshot',  handler: handleAdminBackupCreate },
  { method: 'GET',  path: '/api/admin/backup/download',  handler: handleAdminBackupDownload },
  { method: 'POST', path: '/api/admin/backup/restore',   handler: handleAdminBackupRestore },
  { method: 'POST', path: '/api/paypal/webhook',         handler: handlePayPalWebhook },

  // --- Virtual Account, Auth, Ledger & Sessions ---
  { method: 'POST', path: '/api/account/auto',                    handler: handleAutoAccount },
  { method: 'GET',  path: '/api/account/me',                      handler: handleAccountMe },
  { method: 'POST', path: '/api/account/register',                handler: handleRegisterAccount },
  { method: 'POST', path: '/api/account/resend-verification',     handler: handleResendVerification },
  { method: 'POST', path: '/api/account/verify-email',            handler: handleVerifyEmail },
  { method: 'POST', path: '/api/account/login',                   handler: handleLoginAccount },
  { method: 'POST', path: '/api/account/logout',                  handler: handleLogoutAccount },
  { method: 'POST', path: '/api/account/recover/request',         handler: handleRecoverRequest },
  { method: 'POST', path: '/api/account/recover/confirm',         handler: handleRecoverConfirm },
  { method: 'GET',  path: '/api/account/ledger',                  handler: handleAccountLedger },
  { method: 'GET',  path: '/api/account/sessions',                handler: handleListSessions },
  { method: 'POST', path: '/api/account/sessions/revoke',         handler: handleRevokeSession },
  { method: 'POST', path: '/api/account/sessions/revoke-others',  handler: handleRevokeOtherSessions },
  { method: 'GET',  path: '/api/account/export',                  handler: handleAccountExport },

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
