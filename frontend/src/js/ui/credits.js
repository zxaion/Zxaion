/**
 * ui/credits.js — Tampilan saldo kredit + daftar paket kredit.
 * Depends on: ui (base.js), state, elements, utils, CREDIT_PACKS, initPayPalPurchase
 */
Object.assign(ui, {
    updateCreditDisplay() {
        if (elements.creditBalance) {
            elements.creditBalance.textContent = state.lifetime ? '∞' : utils.formatNumber(state.credits);
        }
        if (typeof this.updateDtreasureTabCounts === 'function') {
            this.updateDtreasureTabCounts();
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

    showPurchaseSuccessModal({ packKey, credits, lifetime, recoveryCode, accountId }) {
        if (!elements.purchaseSuccessModal) return;

        state.lastRecoveryCode = recoveryCode || state.lastRecoveryCode || '';
        const resolvedAccountId = accountId || state.account?.accountId || null;

        const acctBox = document.getElementById('purchase-success-account-id');
        if (acctBox) {
            acctBox.textContent = resolvedAccountId || 'ZXA-AUTO';
        }

        if (elements.purchaseSuccessStatus) {
            elements.purchaseSuccessStatus.textContent = lifetime
                ? 'Akun Anda sekarang memiliki Akses Unlimited Lifetime DTREASURE!'
                : `Pembayaran berhasil! Saldo kredit Anda sekarang: ${utils.formatNumber(credits)} credits.`;
        }

        if (elements.purchaseSuccessCode) {
            elements.purchaseSuccessCode.textContent = recoveryCode || 'Gagal membuat kode';
        }

        // Also sync to buy credits modal's recovery display if present
        const recBox = document.getElementById('recovery-code-box');
        const recDisplay = document.getElementById('recovery-code-display');
        if (recDisplay && recoveryCode) {
            recDisplay.textContent = recoveryCode;
            recBox?.classList.remove('hidden');
        }

        elements.purchaseSuccessModal.classList.remove('hidden');
        elements.purchaseSuccessModal.classList.add('flex');
        document.body.style.overflow = 'hidden';
    },

    closePurchaseSuccessModal() {
        if (!elements.purchaseSuccessModal) return;
        elements.purchaseSuccessModal.classList.add('hidden');
        elements.purchaseSuccessModal.classList.remove('flex');
        document.body.style.overflow = '';
    },

    downloadReceiptFile(recoveryCode, packKey) {
        try {
            const token = typeof getOrCreateUserToken === 'function' ? getOrCreateUserToken() : (localStorage.getItem('zx_user_token') || 'N/A');
            const accountId = state.account?.accountId || 'N/A';
            const code = recoveryCode || state.lastRecoveryCode || 'N/A';
            const now = new Date();
            const dateStr = now.toUTCString();
            const packDef = (typeof CREDIT_PACKS !== 'undefined' && packKey && CREDIT_PACKS[packKey]) ? CREDIT_PACKS[packKey] : state.selectedCreditPack;
            const packName = packDef ? `${packDef.label} ($${packDef.price})` : (packKey ? `Pack ${packKey}` : 'Credits Purchase');
            const statusStr = state.lifetime ? 'LIFETIME ACCESS (Unlimited DTREASURE)' : `${state.credits} Credits`;

            const text = [
                '=====================================================',
                '         ZXAION GALLERY — BUKTI & KUNCI PEMULIHAN    ',
                '=====================================================',
                '',
                `Tanggal & Waktu   : ${dateStr}`,
                `Account ID        : ${accountId}`,
                `Paket Transaksi   : ${packName}`,
                `Status Saldo Akun : ${statusStr}`,
                `Token Akun Rahasia: ${token}`,
                `RECOVERY KEY      : ${code}`,
                '',
                '-----------------------------------------------------',
                'PETUNJUK MEMULIHKAN AKUN JIKA GANTI PERANGKAT/BROWSER:',
                '-----------------------------------------------------',
                '1. Buka situs ZXAION GALLERY.',
                '2. Klik tombol "Buy Credits" di bilah atas.',
                '3. Gulir ke bagian "Account Backup & Restore".',
                '4. Masukkan RECOVERY KEY Anda di atas pada kolom yang tersedia.',
                '5. Klik tombol "Restore". Seluruh saldo kredit & hak unduh DTREASURE Anda akan pulih seketika!',
                '',
                'PERINGATAN:',
                'Simpan file ini dengan aman di penyimpanan pribadi Anda (Google Drive, catatan aman, dll).',
                '=====================================================',
            ].join('\r\n');

            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const cleanCode = code.replace(/[^A-Za-z0-9_-]/g, '');
            a.download = `zxaion-backup-receipt-${cleanCode || 'key'}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            ui.showToast('File struk backup (.txt) berhasil diunduh!', 'success', 4000);
        } catch (e) {
            console.error('Download receipt error:', e);
            ui.showToast('Gagal mengunduh struk backup.', 'error');
        }
    },
});
