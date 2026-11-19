/**
 * events/search.js — Input pencarian desktop/mobile + tombol clear.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initSearchEvents() {
    // Search — separate debounce instances per input (cegah timer conflict)
    const debouncedSearchDesktop = utils.debounce((e) => {
        const query = e.target.value.trim();
        if (elements.searchInputMobile) elements.searchInputMobile.value = e.target.value;
        if (query.length > 0 || state.searchQuery !== '') ui.handleSearch(query);
    }, 300);

    const debouncedSearchMobile = utils.debounce((e) => {
        const query = e.target.value.trim();
        if (elements.searchInput) elements.searchInput.value = e.target.value;
        if (query.length > 0 || state.searchQuery !== '') ui.handleSearch(query);
    }, 300);

    if (elements.searchInput)       elements.searchInput.addEventListener('input', debouncedSearchDesktop);
    if (elements.searchInputMobile) elements.searchInputMobile.addEventListener('input', debouncedSearchMobile);

    elements.searchClear?.addEventListener('click', () => {
        if (elements.searchInput)       elements.searchInput.value = '';
        if (elements.searchInputMobile) elements.searchInputMobile.value = '';
        elements.searchClear.classList.add('hidden');
        ui.changeCategory(state.currentCategory);
    });
}
