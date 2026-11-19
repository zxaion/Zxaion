/**
 * ui/layout.js — Hitung otomatis posisi sticky category-nav (tinggi nav + mobile search).
 * Depends on: (tidak ada)
 */
// ============================================================
// Dynamic sticky top — kalkulasi otomatis berdasarkan tinggi
// nav + mobile search agar category-nav tidak overlap elemen lain.
// ============================================================
function updateCategoryNavTop() {
    const nav          = document.querySelector('nav');
    const mobileSearch = document.getElementById('mobile-search-bar');
    const catNav       = document.getElementById('category-nav');
    if (!catNav || !nav) return;

    const navHeight    = nav.getBoundingClientRect().height;
    const isMobile     = window.innerWidth < 768;
    const searchHeight = (isMobile && mobileSearch)
        ? mobileSearch.getBoundingClientRect().height
        : 0;

    catNav.style.top = `${Math.ceil(navHeight + searchHeight)}px`;
}
