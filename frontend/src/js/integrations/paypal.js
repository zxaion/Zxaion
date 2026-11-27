/**
 * integrations/paypal.js — Integrasi PayPal Buttons (SDK dimuat on-demand saat checkout/modal dibuka).
 * Depends on: state, elements, api, ui, getOrCreateUserToken, window.paypal
 */
// --- PayPal Integration ---
const PAYPAL_SDK_URL = 'https://www.paypal.com/sdk/js?client-id=AcpluY9gPGFZbJpJF5d1OHDRpiKfR6ZNiTig4KaUIO76LDGZs4-AundI9E9MVCSqGmK-zoAR16bChBf1&currency=USD&intent=capture';
let paypalButtonsInstance = null;
let _paypalSdkWaitTimer = null;
let _paypalSdkLoadPromise = null;

function ensurePayPalSdkLoaded() {
    if (typeof window !== 'undefined' && window.paypal) {
        return Promise.resolve(window.paypal);
    }
    if (_paypalSdkLoadPromise) return _paypalSdkLoadPromise;
    if (typeof document === 'undefined') return Promise.reject(new Error('No document'));

    _paypalSdkLoadPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-paypal-sdk="true"]');
        if (existing) {
            if (window.paypal) return resolve(window.paypal);
            existing.addEventListener('load', () => resolve(window.paypal), { once: true });
            existing.addEventListener('error', () => {
                _paypalSdkLoadPromise = null;
                reject(new Error('PayPal SDK failed to load'));
            }, { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = PAYPAL_SDK_URL;
        script.async = true;
        script.dataset.paypalSdk = 'true';
        script.onload = () => {
            if (window.paypal) resolve(window.paypal);
            else {
                _paypalSdkLoadPromise = null;
                reject(new Error('PayPal SDK loaded without window.paypal'));
            }
        };
        script.onerror = () => {
            _paypalSdkLoadPromise = null;
            reject(new Error('PayPal SDK failed to load'));
        };
        document.head.appendChild(script);
    });
    return _paypalSdkLoadPromise;
}

function initPayPalPurchase(packKey, price) {
    if (_paypalSdkWaitTimer) {
        clearInterval(_paypalSdkWaitTimer);
        _paypalSdkWaitTimer = null;
    }

    if (!window.paypal) {
        if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.remove('hidden');
        if (elements.paypalButtons) {
            elements.paypalButtons.innerHTML = '<div class="py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400"><i class="fas fa-spinner fa-spin mr-1.5"></i>Loading PayPal Checkout...</div>';
        }
        ensurePayPalSdkLoaded()
            .then(() => {
                if (state.selectedCreditPack?.key === packKey) {
                    _renderPayPalButtons(packKey, price);
                }
            })
            .catch(() => {
                if (elements.paypalButtons) {
                    elements.paypalButtons.innerHTML = '<p class="py-3 text-center text-xs text-red-500 font-semibold">PayPal SDK unavailable. Please disable blockers or refresh.</p>';
                }
                ui.showToast('PayPal SDK failed to load. Please check your connection and refresh.', 'error');
            });
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

            createOrder: async () => {
                const autoRes = await api.ensureAutoAccount?.();
                if (autoRes && autoRes.requiresLogin) {
                    const msg = 'Please sign in to your account before purchasing credits.';
                    ui.showToast(msg, 'warning');
                    ui.openAccountModal?.('security');
                    throw new Error(msg);
                }
                const res = await api.createOrder(packKey);
                if (!res?.success || !res.orderId) {
                    const msg = res?.error || 'Could not initialize secure checkout. Please try again.';
                    ui.showToast(msg, 'error');
                    throw new Error(msg);
                }
                return res.orderId;
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
                        await Promise.allSettled([
                            api.fetchCreditBalance(),
                            api.fetchAccountProfile?.(),
                        ]);
                        api.invalidateCache();

                        ui.showToast(
                            state.lifetime
                                ? 'Lifetime Access Activated! Enjoy unlimited DTREASURE downloads.'
                                : `Purchase Successful! You now have ${result.newBalance} credits.`,
                            'success',
                            5000
                        );

                        const buyCreditsModal = document.getElementById('buy-credits-modal');
                        if (buyCreditsModal) { buyCreditsModal.classList.add('hidden'); buyCreditsModal.classList.remove('flex'); }
                        document.body.style.overflow = '';
                        if (elements.paypalButtonContainer) elements.paypalButtonContainer.classList.add('hidden');
                        if (elements.paypalButtons) elements.paypalButtons.innerHTML = '';
                        paypalButtonsInstance = null;

                        if (state.currentCategory === 'DTREASURE') ui.renderDtreasureGallery();

                        // Auto-prompt backup key recovery modal so user never loses credits/purchases
                        try {
                            const recoveryRes = await api.generateRecoveryCode();
                            const recCode = recoveryRes?.success ? recoveryRes.recoveryCode : null;
                            ui.showPurchaseSuccessModal({
                                packKey,
                                credits: result.newBalance,
                                lifetime: state.lifetime,
                                recoveryCode: recCode,
                                accountId: result.accountId || state.account?.accountId || null,
                            });
                        } catch (e) {
                            console.error('Failed to auto-generate recovery code after purchase:', e);
                            ui.showPurchaseSuccessModal({
                                packKey,
                                credits: result.newBalance,
                                lifetime: state.lifetime,
                                recoveryCode: null
                            });
                        }

                    } else {
                        const errMsg  = result?.error || 'Credits could not be applied automatically';
                        const orderId = result?.orderId || capturedOrderId;
                        ui.showToast(
                            `Payment received (${errMsg}). Order ID: ${orderId}. Email zvizualscl@gmail.com for assistance.`,
                            'warning',
                            8000
                        );
                    }
                } catch (error) {
                    console.error('PayPal onApprove error:', error);
                    ui.showToast(
                        `Payment processing error${capturedOrderId ? ` (Order ID: ${capturedOrderId})` : ''}: ${error.message || 'Unexpected error'}`,
                        'error',
                        6000
                    );
                }
            },

            onError:  (err) => { console.error('PayPal error:', err); ui.showToast('PayPal error. Please try again.', 'error'); },
            onCancel: ()    => { console.log('User cancelled payment'); }
        });

        if (elements.paypalButtons) {
            paypalButtonsInstance.render('#paypal-buttons').catch(error => {
                console.error('PayPal render error:', error);
                ui.showToast('Failed to load PayPal. Please refresh the page.', 'error');
                paypalButtonsInstance = null;
            });
        }
    } catch (error) {
        console.error('Error initializing PayPal:', error);
        ui.showToast('Failed to initialize PayPal. Please try again.', 'error');
        paypalButtonsInstance = null;
    }
}
