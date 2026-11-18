// frontend/js/ui/credits.js
// UI kredit: saldo & paket
import { CREDIT_PACKS } from '../config/constants.js';
import { initPayPalPurchase } from '../payments/paypal.js';
import { state } from '../state/appState.js';
import { elements } from './elements.js';
import { ui } from './index.js';
import { utils } from '../utils/helpers.js';

Object.assign(ui, {
    updateCreditDisplay() {
        if (elements.creditBalance) {
            elements.creditBalance.textContent = state.lifetime ? '∞' : utils.formatNumber(state.credits);
        }
    },

    renderCreditPacks() {
        const packsDiv = document.getElementById('credit-packs');
        if (!packsDiv) return;
        packsDiv.innerHTML = '';

        Object.entries(CREDIT_PACKS).forEach(([key, pack]) => {
            const isLifetime = pack.credits === 'lifetime';
            const btn        = document.createElement('button');
            btn.type         = 'button';
            btn.className    = `credit-pack-card w-full bg-gradient-to-r ${pack.color} p-0.5 rounded-2xl transition-all duration-300`;
            btn.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-[14px] p-4 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gradient-to-br ${pack.color} rounded-xl flex items-center justify-center shadow-lg">
                            <i class="fas fa-${isLifetime ? 'crown' : 'coins'} text-white text-xl"></i>
                        </div>
                        <div class="text-left">
                            <div class="font-bold text-gray-900 dark:text-white text-lg">${pack.label}</div>
                            <div class="text-sm text-gray-500 dark:text-gray-400">
                                ${isLifetime ? 'Lifetime Access' : `${pack.credits.toLocaleString()} credits`}
                                ${pack.bonus ? `<span class="text-green-500 font-semibold ml-1">+${pack.bonus} bonus</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-black text-2xl text-gray-900 dark:text-white">$${pack.price}</div>
                        <div class="text-xs text-gray-400">${isLifetime ? 'One-time' : 'USD'}</div>
                    </div>
                </div>
            `;

            btn.addEventListener('click', () => {
                document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
                btn.classList.add('selected');
                state.selectedCreditPack = { key, ...pack };
                initPayPalPurchase(key, pack.price);
            });

            packsDiv.appendChild(btn);
        });
    },
});
