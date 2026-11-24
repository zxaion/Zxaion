/**
 * events/index.js — initEvents(): memanggil semua kelompok event (urutan sama seperti kode asli).
 * Depends on: semua file events/*.js
 */
function initEvents() {
    initNavigationEvents();
    initSearchEvents();
    initDonationEvents();
    initModalEvents();
    initPaginationEvents();
    initCreditsEvents();
    initAccountEvents();
    initAdminEvents();
    initGlobalEvents();
}
