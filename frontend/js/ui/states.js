// frontend/js/ui/states.js
// UI status: kosong, tanpa hasil
import { state } from '../state/appState.js';
import { ui } from './index.js';

Object.assign(ui, {
    showEmptyState() {
        document.getElementById('empty-state')?.classList.remove('hidden');
    },

    hideEmptyState() {
        document.getElementById('empty-state')?.classList.add('hidden');
    },

    showNoResults() {
        document.getElementById('no-results')?.classList.remove('hidden');
    },

    hideNoResults() {
        document.getElementById('no-results')?.classList.add('hidden');
    },
});
