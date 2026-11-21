/**
 * ui/quicklinks.js — Menu Quicklinks: load /quicklink.json + DOMParser allowlist HTML sanitizer.
 * Depends on: ui (base.js), utils
 */
const QUICKLINK_ALLOWED_TAGS = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4',
    'HR', 'I', 'LI', 'OL', 'P', 'PRE', 'SPAN', 'STRONG', 'U', 'UL', 'IMG',
]);

const QUICKLINK_ALLOWED_ATTRS = new Set(['href', 'title', 'target', 'rel', 'class', 'src', 'alt']);

function isSafeQuicklinkUrl(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
    try {
        const parsed = new URL(trimmed, window.location.origin);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:';
    } catch {
        return false;
    }
}

function sanitizeQuicklinkNode(node, doc) {
    if (node.nodeType === Node.TEXT_NODE) {
        return doc.createTextNode(node.textContent || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const tag = node.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED') {
        return null;
    }

    if (!QUICKLINK_ALLOWED_TAGS.has(tag)) {
        const fragment = doc.createDocumentFragment();
        Array.from(node.childNodes).forEach((child) => {
            const cleanChild = sanitizeQuicklinkNode(child, doc);
            if (cleanChild) fragment.appendChild(cleanChild);
        });
        return fragment;
    }

    const cleanEl = doc.createElement(tag.toLowerCase());
    Array.from(node.attributes).forEach((attr) => {
        const attrName = attr.name.toLowerCase();
        if (!QUICKLINK_ALLOWED_ATTRS.has(attrName)) return;

        if (attrName === 'href' || attrName === 'src') {
            if (!isSafeQuicklinkUrl(attr.value)) return;
            cleanEl.setAttribute(attrName, attr.value.trim());
            return;
        }
        cleanEl.setAttribute(attrName, attr.value);
    });

    if (tag === 'A' && cleanEl.getAttribute('target') === '_blank') {
        cleanEl.setAttribute('rel', 'noopener noreferrer');
    }

    Array.from(node.childNodes).forEach((child) => {
        const cleanChild = sanitizeQuicklinkNode(child, doc);
        if (cleanChild) cleanEl.appendChild(cleanChild);
    });

    return cleanEl;
}

function sanitizeQuicklinkHtml(html) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(String(html || ''), 'text/html');
    const wrapper = document.createElement('div');
    Array.from(parsed.body.childNodes).forEach((child) => {
        const cleanNode = sanitizeQuicklinkNode(child, document);
        if (cleanNode) wrapper.appendChild(cleanNode);
    });
    return wrapper;
}

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
                        contentEl.innerHTML = '';
                        contentEl.appendChild(sanitizeQuicklinkHtml(data[key].content || ''));
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
