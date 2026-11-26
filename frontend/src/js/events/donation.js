/**
 * events/donation.js — Modal donasi, tombol crypto, copy address, modal crypto.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initDonationEvents() {
    // Donation modal
    const donationModal = document.getElementById('donation-modal');
    document.getElementById('donation-btn')?.addEventListener('click', () => {
        ui.setModalOpen(donationModal, true, { lockScroll: false });
    });
    document.getElementById('close-donation')?.addEventListener('click', () => {
        ui.setModalOpen(donationModal, false);
    });

    // Crypto buttons
    document.querySelectorAll('.crypto-btn, .crypto-btn-usdt').forEach(btn => {
        btn.addEventListener('click', function() {
            const address = this.dataset.address;
            const name    = this.dataset.name;

            const cryptoTypeEl      = document.getElementById('crypto-type');
            const cryptoAddressEl   = document.getElementById('crypto-address');
            const cryptoIconEl      = document.getElementById('crypto-icon');
            const cryptoIconBadgeEl = document.getElementById('crypto-icon-badge');
            const sourceBadge       = this.querySelector('.crypto-logo-badge');

            if (cryptoTypeEl)    cryptoTypeEl.textContent  = name;
            if (cryptoAddressEl) cryptoAddressEl.textContent = address;

            if (cryptoIconBadgeEl && sourceBadge) {
                cryptoIconBadgeEl.className = sourceBadge.dataset.modalBadgeClass
                    || 'relative w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg';
            }
            if (cryptoIconEl && sourceBadge) {
                cryptoIconEl.innerHTML = sourceBadge.innerHTML;
                cryptoIconEl.querySelectorAll('svg.crypto-main-svg').forEach(svg => {
                    svg.setAttribute('class', 'crypto-main-svg w-9 h-9');
                });
                const netBadge = cryptoIconEl.querySelector('span');
                if (netBadge) {
                    netBadge.classList.remove('w-4', 'h-4');
                    netBadge.classList.add('w-6', 'h-6');
                    netBadge.querySelectorAll('svg').forEach(svg => svg.setAttribute('class', 'w-3.5 h-3.5'));
                }
            }

            ui.setModalOpen('crypto-modal', true, { lockScroll: false });
        });
    });

    // Copy crypto address
    document.getElementById('copy-crypto-address')?.addEventListener('click', async function() {
        const address = document.getElementById('crypto-address')?.textContent;
        if (!address) return;
        try {
            await utils.copyText(address);
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
            this.classList.add('bg-green-600');
            setTimeout(() => { this.innerHTML = originalText; this.classList.remove('bg-green-600'); }, 2000);
        } catch {
            ui.showToast('Failed to copy address.', 'error');
        }
    });

    // Close crypto modal
    document.getElementById('close-crypto-modal')?.addEventListener('click', () => {
        ui.setModalOpen('crypto-modal', false);
    });
}
