document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#app-version').forEach(el => {
        el.textContent = 'v' + APP_CONFIG.version;
    });

    const urlInput = document.getElementById('rtdb-url-input');
    if (urlInput) {
        urlInput.value = getRtdbBase();
        urlInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val) localStorage.setItem('rtdb_base', normalizeRtdbUrl(val));
        });
    }

    const tgInput = document.getElementById('tg-token-input');
    if (tgInput) {
        tgInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val) localStorage.setItem('tg_token', val);
        });
    }

    document.getElementById('login-username').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    document.getElementById('login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    // 保證每次開啟都有綁定：預先寫入本地快取並嘗試種子到 Firebase
    if (typeof seedDefaultChats === 'function') seedDefaultChats();
    // 若本地還沒快取，立刻寫入 DEFAULT_CHATS
    if (!localStorage.getItem('tg_chats_fallback') && typeof DEFAULT_CHATS !== 'undefined') {
        localStorage.setItem('tg_chats_fallback', JSON.stringify(DEFAULT_CHATS));
    }
    // 啟動每晚 22:00 自動提醒（需保持網頁開啟）
    if (typeof initNightlyScheduler === 'function') initNightlyScheduler();
    // 跨日或手機解鎖時，自動換成當天清單
    if (typeof refreshPackingDayIfNeeded === 'function') {
        setInterval(refreshPackingDayIfNeeded, 60 * 1000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshPackingDayIfNeeded();
        });
    }
    restoreSession();
});

function showSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('rtdb-url-input').value = getRtdbBase();
    document.getElementById('tg-token-input').value = getTgToken();
    if (!getTgToken()) {
        const box = document.getElementById('test-result-box');
        if (box) { box.className = 'block text-xs font-mono p-3 rounded-lg bg-amber-100 text-amber-800 border border-amber-200'; box.textContent = '⚠️ 尚未設定 Bot Token，請到 @BotFather 產生新 Token 並貼上（舊 Token 已外洩）'; }
    }
    // Webhook 未部署提示
    if (typeof GAS_URL !== 'undefined' && GAS_URL.includes('你的_GAS')) {
        console.warn('GAS_URL 尚未設定，手機轉發需部署 webhook 或改用 poller');
    }
    loadTgChats();
}

function hideSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}