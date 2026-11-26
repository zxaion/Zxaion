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
        ui.setModalOpen(buyCreditsModal, true);
        await api.ensureAutoAccount?.();
        ui.updateAccountBanner?.();
    });

    document.getElementById('buy-credits-open-account-btn')?.addEventListener('click', () => {
        ui.closeBuyCreditsModal();
        ui.openAccountModal?.(state.requiresLogin ? 'security' : 'overview');
    });

    document.getElementById('close-buy-credits')?.addEventListener('click', () => {
        ui.closeBuyCreditsModal();
    });

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
            await utils.copyText(code);
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
