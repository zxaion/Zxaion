/**
 * events/credits.js — Modal Buy Credits + cleanup instance PayPal saat ditutup.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initCreditsEvents() {
    // Buy Credits modal
    const buyCreditsModal = document.getElementById('buy-credits-modal');

    document.getElementById('buy-credits-btn')?.addEventListener('click', () => {
        ui.renderCreditPacks();
        buyCreditsModal?.classList.remove('hidden');
        buyCreditsModal?.classList.add('flex');
    });

    const closeBuyCredits = document.getElementById('close-buy-credits');
    if (closeBuyCredits && buyCreditsModal) {
        closeBuyCredits.addEventListener('click', () => {
            if (typeof paypalButtonsInstance !== 'undefined' && paypalButtonsInstance) {
                try { paypalButtonsInstance.close(); } catch (e) { console.warn('PayPal close error:', e); }
                paypalButtonsInstance = null;
            }
            buyCreditsModal.classList.add('hidden');
            buyCreditsModal.classList.remove('flex');
            document.body.style.overflow = '';
            if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
            if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
            document.querySelectorAll('.credit-pack-card').forEach(c => c.classList.remove('selected'));
            state.selectedCreditPack = null;
        });
    }
}
