/**
 * events/credits.js — Modal Buy Credits, Account Backup & Restore, cleanup PayPal saat ditutup.
 * Depends on: state, elements, ui, utils, api, ITEMS_PER_PAGE, paypalButtonsInstance
 */
function initCreditsEvents() {
    const buyCreditsModal    = document.getElementById('buy-credits-modal');
    const generateBtn        = document.getElementById('generate-recovery-btn');
    const recoveryBox        = document.getElementById('recovery-code-box');
    const recoveryDisplay    = document.getElementById('recovery-code-display');
    const copyRecoveryBtn    = document.getElementById('copy-recovery-btn');
    const recoverInput       = document.getElementById('recover-code-input');
    const recoverBtn         = document.getElementById('recover-account-btn');

    document.getElementById('buy-credits-btn')?.addEventListener('click', async () => {
        ui.renderCreditPacks();
        buyCreditsModal?.classList.remove('hidden');
        buyCreditsModal?.classList.add('flex');
        document.body.style.overflow = 'hidden';
        await api.ensureAutoAccount?.();
        ui.updateAccountBanner?.();
    });

    document.getElementById('buy-credits-open-account-btn')?.addEventListener('click', () => {
        buyCreditsModal?.classList.add('hidden');
        buyCreditsModal?.classList.remove('flex');
        document.body.style.overflow = '';
        ui.openAccountModal?.(state.requiresLogin ? 'security' : 'overview');
    });

    const closeBuyCredits = document.getElementById('close-buy-credits');
    if (closeBuyCredits && buyCreditsModal) {
        closeBuyCredits.addEventListener('click', () => {
            if (typeof _paypalSdkWaitTimer !== 'undefined' && _paypalSdkWaitTimer) {
                clearInterval(_paypalSdkWaitTimer);
                _paypalSdkWaitTimer = null;
            }
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

    generateBtn?.addEventListener('click', async () => {
        const prevText = generateBtn.textContent;
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';

        const result = await api.generateRecoveryCode();
        generateBtn.disabled = false;
        generateBtn.textContent = prevText;

        if (!result.success) {
            ui.showToast(result.error || 'Failed to generate recovery code', 'error');
            return;
        }
        if (recoveryDisplay) recoveryDisplay.textContent = result.recoveryCode;
        recoveryBox?.classList.remove('hidden');
        ui.showToast('Recovery code generated. Save it safely!', 'success');
    });

    copyRecoveryBtn?.addEventListener('click', async () => {
        const code = recoveryDisplay?.textContent?.trim();
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            ui.showToast('Recovery code copied to clipboard!', 'success');
        } catch {
            ui.showToast(`Code: ${code}`, 'info');
        }
    });

    recoverBtn?.addEventListener('click', async () => {
        const code = recoverInput?.value?.trim();
        if (!code) {
            ui.showToast('Please enter your recovery code first.', 'error');
            recoverInput?.focus();
            return;
        }
        const prevText = recoverBtn.textContent;
        recoverBtn.disabled = true;
        recoverBtn.textContent = 'Restoring...';

        const result = await api.recoverAccount(code);
        recoverBtn.disabled = false;
        recoverBtn.textContent = prevText;

        if (!result.success) {
            ui.showToast(result.error || 'Invalid recovery code', 'error');
            return;
        }

        if (recoverInput) recoverInput.value = '';
        recoveryBox?.classList.add('hidden');
        if (recoveryDisplay) recoveryDisplay.textContent = '';
        ui.showToast('Account restored successfully!', 'success');
    });
}
