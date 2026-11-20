/**
 * events/donation.js — Modal donasi, tombol crypto, copy address, modal crypto.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initDonationEvents() {
    // Donation modal
    const donationModal = document.getElementById('donation-modal');
    document.getElementById('donation-btn')?.addEventListener('click', () => {
        donationModal?.classList.remove('hidden');
        donationModal?.classList.add('flex');
    });
    document.getElementById('close-donation')?.addEventListener('click', () => {
        donationModal?.classList.add('hidden');
        donationModal?.classList.remove('flex');
    });

    // Crypto buttons
    document.querySelectorAll('.crypto-btn, .crypto-btn-usdt').forEach(btn => {
        btn.addEventListener('click', function() {
            const address     = this.dataset.address;
            const name        = this.dataset.name;
            const cryptoModal = document.getElementById('crypto-modal');
            const iconMap     = {
                'Bitcoin':  'fab fa-bitcoin text-3xl text-orange-500',
                'Ethereum': 'fab fa-ethereum text-3xl text-blue-500',
                'Solana':   'fas fa-sun text-3xl text-purple-500',
                'BNB':      'fas fa-bolt text-3xl text-yellow-500',
                'Polygon':  'fas fa-hexagon text-3xl text-indigo-500',
                'XRP':      'fas fa-chart-line text-3xl text-cyan-500',
            };
            const iconClass = Object.keys(iconMap).find(k => name?.includes(k));

            const cryptoTypeEl    = document.getElementById('crypto-type');
            const cryptoAddressEl = document.getElementById('crypto-address');
            const cryptoIconEl    = document.getElementById('crypto-icon');

            if (cryptoTypeEl)    cryptoTypeEl.textContent  = name;
            if (cryptoAddressEl) cryptoAddressEl.textContent = address;
            if (cryptoIconEl)    cryptoIconEl.className    = iconClass ? iconMap[iconClass] : 'fas fa-coins text-3xl text-gray-600 dark:text-gray-400';

            if (cryptoModal) { cryptoModal.classList.remove('hidden'); cryptoModal.classList.add('flex'); }
        });
    });

    // Copy crypto address
    document.getElementById('copy-crypto-address')?.addEventListener('click', function() {
        const address = document.getElementById('crypto-address')?.textContent;
        if (!address) return;
        navigator.clipboard.writeText(address).then(() => {
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
            this.classList.add('bg-green-600');
            setTimeout(() => { this.innerHTML = originalText; this.classList.remove('bg-green-600'); }, 2000);
        }).catch(() => alert('Failed to copy address'));
    });

    // Close crypto modal
    const cryptoModal = document.getElementById('crypto-modal');
    document.getElementById('close-crypto-modal')?.addEventListener('click', () => {
        cryptoModal?.classList.add('hidden'); cryptoModal?.classList.remove('flex');
    });
}
