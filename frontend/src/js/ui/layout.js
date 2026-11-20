/**
 * ui/layout.js — Hitung otomatis posisi sticky category-nav (tinggi nav + mobile search).
 * Depends on: (tidak ada)
 */
// ============================================================
// Dynamic sticky top — kalkulasi otomatis berdasarkan tinggi
// nav + mobile search agar category-nav tidak overlap elemen lain.
// ============================================================
function updateCategoryNavTop() {
    const nav    = document.querySelector('nav');
    const catNav = document.getElementById('category-nav');
    if (!catNav || !nav) return;

    if (window.innerWidth < 768) {
        catNav.style.top = '';
        return;
    }

    const navHeight = nav.getBoundingClientRect().height;
    catNav.style.top = `${Math.ceil(navHeight)}px`;
}