/**
 * ui/layout.js — Hitung otomatis posisi sticky category-nav (tinggi nav).
 * Depends on: (tidak ada)
 */
// ============================================================
// Dynamic sticky top — kalkulasi otomatis berdasarkan tinggi
// nav agar category-nav tidak overlap dengan navbar di desktop.
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
