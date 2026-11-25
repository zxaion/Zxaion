/**
 * events/search.js — Input pencarian desktop/mobile + tombol clear.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initSearchEvents() {
    const debouncedSearch = utils.debounce((e) => {
        const query = e.target.value.trim();
        if (elements.searchClear) elements.searchClear.classList.toggle('hidden', e.target.value.length === 0);
        if (query.length > 0 || state.searchQuery !== '') ui.handleSearch(query);
    }, 300);

    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debouncedSearch);
        elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (elements.searchInput.value) {
                    elements.searchInput.value = '';
                    elements.searchClear?.classList.add('hidden');
                    if (state.searchQuery !== '') ui.changeCategory(state.currentCategory, { scroll: false });
                } else {
                    elements.searchInput.blur();
                }
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const active = document.activeElement;
        const tag = active?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || active?.isContentEditable) return;
        if (ui.isAdminOpen?.()) return;
        if (!elements.searchInput) return;
        e.preventDefault();
        elements.searchInput.focus();
        elements.searchInput.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });

    elements.searchClear?.addEventListener('click', () => {
        if (elements.searchInput) {
            elements.searchInput.value = '';
            elements.searchInput.focus();
        }
        elements.searchClear.classList.add('hidden');
        ui.changeCategory(state.currentCategory, { scroll: false });
    });
}
