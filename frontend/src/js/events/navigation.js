/**
 * events/navigation.js — Home link + tombol kategori.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initNavigationEvents() {
    // Home link
    document.getElementById('home-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        ui.changeCategory('All');
    });

    // Category buttons
    const categoryMap = {
        'cat-all':         'All',
        'cat-anime':       'Anime',
        'cat-fantasy':     'Fantasy',
        'cat-abstract':    'Abstract',
        'cat-photography': 'Photography',
        'cat-comitbase':   'COMITBASE',
        'cat-dtreasure':   'DTREASURE',
        'cat-zmeme':       'ZMEME',
        'cat-overlay':     'OVERLAY'
    };

    Object.entries(categoryMap).forEach(([id, category]) => {
        document.getElementById(id)?.addEventListener('click', () => ui.changeCategory(category));
    });
}
