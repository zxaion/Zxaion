/**
 * integrations/paypal.js — Integrasi PayPal Buttons (SDK di-load dari index.html).
 * Depends on: state, elements, api, ui, getOrCreateUserToken, window.paypal
 */
// --- PayPal Integration ---
let paypalButtonsInstance = null;

// Guard: jika SDK belum load (defer script), retry hingga 3x
function initPayPalPurchase(packKey, price) {
    if (!window.paypal) {
        let retries = 0;
        const waitForSdk = setInterval(() => {
            retries++;
            if (window.paypal) {
                clearInterval(waitForSdk);
                _renderPayPalButtons(packKey, price);
            } else if (retries >= 3) {
                clearInterval(waitForSdk);
                alert('❌ PayPal SDK failed to load. Please check your internet connection and refresh the page.');
            }
        }, 800);
        return;
    }
    _renderPayPalButtons(packKey, price);
}

function _renderPayPalButtons(packKey, price) {
    if (paypalButtonsInstance) {
        try { paypalButtonsInstance.close(); } catch (e) { console.warn('Error closing previous PayPal instance:', e); }
        paypalButtonsInstance = null;
    }

    if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.remove('hidden');
    if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';

    try {
        paypalButtonsInstance = paypal.Buttons({
            style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'paypal' },

            createOrder: (data, actions) => {
                const token = getOrCreateUserToken();
                return actions.order.create({
                    purchase_units: [{
                        description: `ZXAION Credits: ${packKey}`,
                        custom_id:   token,
                        amount:      { currency_code: 'USD', value: price.toString() }
                    }]
                });
            },

            onApprove: async (data, actions) => {
                let capturedOrderId = null;
                try {
                    const order     = await actions.order.capture();
                    capturedOrderId = order.id;

                    let result      = null;
                    let retryCount  = 0;
                    const maxRetries = 3;

                    while (retryCount < maxRetries) {
                        try {
                            result = await api.purchaseCredits(packKey, capturedOrderId);
                            if (result.success) break;
                            retryCount++;
                            if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 2000 * retryCount));
                        } catch (e) {
                            retryCount++;
                            console.error(`Attempt ${retryCount} network error:`, e);
                            if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 2000 * retryCount));
                        }
                    }

                    if (result && result.success) {
                        state.credits  = result.newBalance;
                        state.lifetime = result.lifetime || false;
                        ui.updateCreditDisplay();
                        await api.fetchCreditBalance();
                        api.invalidateCache();

                        alert(state.lifetime
                            ? '✅ Lifetime Access Activated!\n\nEnjoy unlimited downloads on DTREASURE collection.'
                            : `✅ Purchase Successful!\n\nYou now have ${result.newBalance} credits.`
                        );

                        const buyCreditsModal = document.getElementById('buy-credits-modal');
                        if (buyCreditsModal) { buyCreditsModal.classList.add('hidden'); buyCreditsModal.classList.remove('flex'); }
                        document.body.style.overflow = '';
                        if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
                        if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
                        paypalButtonsInstance = null;

                        if (state.currentCategory === 'DTREASURE') ui.renderDtreasureGallery();

                    } else {
                        const errMsg  = result?.error || 'Credits could not be applied automatically';
                        const orderId = result?.orderId || capturedOrderId;
                        alert(
                            `⚠️ Payment Received But Auto-Credit Failed\n\n` +
                            `Order ID: ${orderId}\n\n` +
                            `Email zxaionxl@gmail.com with Order ID above.\n` +
                            `Credits will be added within 24 hours.`
                        );
                    }
                } catch (error) {
                    console.error('PayPal onApprove error:', error);
                    alert(`❌ Payment Processing Error${capturedOrderId ? '\n\nOrder ID: ' + capturedOrderId : ''}\n\n${error.message || 'An unexpected error occurred.'}`);
                }
            },

            onError:  (err) => { console.error('PayPal error:', err); alert('❌ PayPal error. Please try again.'); },
            onCancel: ()    => { console.log('User cancelled payment'); }
        });

        if (elements.paypalButtons) {
            paypalButtonsInstance.render('#paypal-buttons').catch(error => {
                console.error('PayPal render error:', error);
                alert('❌ Failed to load PayPal. Please refresh the page.');
                paypalButtonsInstance = null;
            });
        }
    } catch (error) {
        console.error('Error initializing PayPal:', error);
        alert('❌ Failed to initialize PayPal. Please try again.');
        paypalButtonsInstance = null;
    }
}
