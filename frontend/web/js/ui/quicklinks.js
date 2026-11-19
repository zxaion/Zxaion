/**
 * ui/quicklinks.js — Menu Quicklinks: load /quicklink.json + tampil konten (sanitasi dasar).
 * Depends on: ui (base.js), utils
 */
Object.assign(ui, {
    async loadQuicklinks() {
        const list = document.getElementById('quicklinks-list');
        if (!list) return;
        try {
            const res = await fetch('/quicklink.json');
            if (!res.ok) throw new Error(`Failed to load quicklinks: HTTP ${res.status}`);
            const data = await res.json();
            list.innerHTML = '';

            Object.keys(data).forEach(key => {
                const btn = document.createElement('button');
                btn.type  = 'button';
                btn.className = 'w-full text-left bg-gray-50 hover:bg-gray-100 p-4 rounded-xl transition-all duration-300 flex items-center justify-between group dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white';
                btn.innerHTML = `
                    <span class="font-semibold">${utils.escapeHtml(data[key].title)}</span>
                    <i class="fas fa-chevron-right text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-300 dark:group-hover:text-gray-300"></i>
                `;
                btn.addEventListener('click', () => {
                    const titleEl    = document.getElementById('quicklink-title');
                    const contentEl  = document.getElementById('quicklink-content');
                    const modalEl    = document.getElementById('quicklink-content-modal');
                    const menuModalEl = document.getElementById('menu-modal');

                    if (titleEl)   titleEl.textContent = data[key].title;
                    if (contentEl) {
                        // Sanitasi dasar: hapus script, inline handlers, javascript: URI
                        const sanitized = (data[key].content || '')
                            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
                            .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
                            .replace(/javascript\s*:/gi, '');
                        contentEl.innerHTML = sanitized;
                    }
                    if (modalEl)    { modalEl.classList.remove('hidden');    modalEl.classList.add('flex'); }
                    if (menuModalEl) { menuModalEl.classList.add('hidden'); menuModalEl.classList.remove('flex'); }
                });
                list.appendChild(btn);
            });
        } catch (e) {
            console.error('Failed to load quicklinks:', e);
            list.innerHTML = '<p class="text-center text-gray-500 py-4 dark:text-gray-400">Failed to load links</p>';
        }
    },
});
