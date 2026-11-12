function getTgToken() {
    return localStorage.getItem('tg_token') || APP_CONFIG.defaultTgToken || '';
}

async function saveTgToken() {
    const token = document.getElementById('tg-token-input').value.trim();
    if (!token) {
        alert('請輸入 Telegram Bot Token');
        return;
    }
    localStorage.setItem('tg_token', token);
    alert('Token 已儲存');
    loadTgChats();
}

// 取得有效的 chats：優先 Firebase，失敗或為空則回退到 DEFAULT_CHATS
function getFallbackChats() {
    try {
        const local = JSON.parse(localStorage.getItem('tg_chats_fallback') || 'null');
        if (local && typeof local === 'object') return { ...DEFAULT_CHATS, ...local };
    } catch (e) {}
    return { ...DEFAULT_CHATS };
}

async function getEffectiveChats() {
    try {
        const chats = await dbGet(APP_CONFIG.telegramChatsRoot + '.json');
        if (chats && typeof chats === 'object' && Object.keys(chats).length > 0) {
            // 同步到本地快取，方便離線/401 時仍顯示已綁定
            localStorage.setItem('tg_chats_fallback', JSON.stringify(chats));
            return { ...DEFAULT_CHATS, ...chats };
        }
    } catch (e) {
        console.warn('讀取 Firebase chats 失敗，改用本地預設:', e.message);
    }
    return getFallbackChats();
}

async function getChatIdWithFallback(account) {
    try {
        const cid = await dbGet(APP_CONFIG.telegramChatsRoot + '/' + account + '.json');
        if (cid) {
            // 更新本地快取
            const cache = getFallbackChats();
            cache[account] = String(cid);
            localStorage.setItem('tg_chats_fallback', JSON.stringify(cache));
            return String(cid);
        }
    } catch (e) {}
    const fb = getFallbackChats();
    return fb[account] || null;
}

// 開啟即自動種子：若 Firebase 為空或 401，自動寫入 DEFAULT_CHATS（寫入失敗也不影響本地顯示）
async function seedDefaultChats() {
    try {
        const chats = await dbGet(APP_CONFIG.telegramChatsRoot + '.json');
        if (!chats || Object.keys(chats).length === 0) {
            for (const [acc, cid] of Object.entries(DEFAULT_CHATS)) {
                try { await dbPut(APP_CONFIG.telegramChatsRoot + '/' + acc + '.json', cid); } catch (e) {}
            }
        }
    } catch (e) {
        // 401 時無法寫入也沒關係，本地 fallback 已保證顯示為已綁定
        localStorage.setItem('tg_chats_fallback', JSON.stringify(getFallbackChats()));
    }
}

async function loadTgChats() {
    const listEl = document.getElementById('tg-chat-list');
    if (!listEl) return;
    const chats = await getEffectiveChats();
    const entries = Object.entries(chats);
    listEl.innerHTML = '';
    if (entries.length === 0) {
        const li = document.createElement('li');
        li.style.cssText = 'font-size:13px;color:#94a3b8;';
        li.textContent = '尚未綁定任何聊天';
        listEl.appendChild(li);
        return;
    }
    const isFallback = await (async () => {
        try { await dbGet(APP_CONFIG.telegramChatsRoot + '.json'); return false; } catch (e) { return true; }
    })();
    entries.forEach(([pid, cid]) => {
        const li = document.createElement('li');
        li.style.cssText = 'font-size:13px;color:#334155;';
        li.textContent = pid + ' → ' + cid;
        if (isFallback) {
            const span = document.createElement('span');
            span.style.cssText = 'color:#94a3b8;font-size:11px;';
            span.textContent = ' (本地預設)';
            li.appendChild(span);
        }
        listEl.appendChild(li);
    });
}

async function bindParentChat() {
    const parentId = document.getElementById('tg-bind-parent').value;
    let chatId = document.getElementById('tg-bind-chatid').value.trim();
    if (!chatId || !/^\d+$/.test(chatId)) {
        alert('Chat ID 需為純數字');
        return;
    }
    chatId = chatId.slice(0, 20);
    // 先寫本地，保證立刻顯示為已綁定
    const cache = getFallbackChats();
    cache[parentId] = chatId;
    localStorage.setItem('tg_chats_fallback', JSON.stringify(cache));
    try {
        await dbPut(APP_CONFIG.telegramChatsRoot + '/' + parentId + '.json', chatId);
    } catch (e) {
        console.warn('寫入 Firebase 失敗，僅保留本地:', e.message);
    }
    document.getElementById('tg-bind-chatid').value = '';
    loadTgChats();
    alert('已綁定 ' + parentId + ' → ' + chatId + '（本地已生效，Firebase ' + (navigator.onLine ? '已同步/已快取' : '離線已快取') + '）');
}

async function sendTelegram(chatId, text) {
    const token = getTgToken();
    if (!token) throw new Error('尚未設定 Bot Token');
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(chatId), text: text })
    });
    if (!res.ok) throw new Error('Telegram 回傳錯誤 ' + res.status);
}