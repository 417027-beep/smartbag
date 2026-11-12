async function ensureCommonDataParent() {
    if (!scheduleData || scheduleData.length === 0) {
        loadMockData();
        try { await fetchScheduleData(); } catch(e) { console.warn('載入課表失敗', e); renderTable(); prepareSmartPacking(); }
    }
    if (typeof teacherItems !== 'undefined') {
        try {
            const data = await dbGet(APP_CONFIG.teacherItemsPath);
            teacherItems = Array.isArray(data) ? data : [];
        } catch(e) {}
    }
    try { updateClock(); } catch(e) {}
    try { highlightToday(); } catch(e) {}
    try { setInitialTargetDay(); } catch(e) {}
}
async function initParentView() {
    document.getElementById('app-version').textContent = 'v' + APP_CONFIG.version;
    const childId = currentUser.child;
    const info = USERS[childId];
    document.getElementById('parent-child-name').textContent =
        info ? info.name + ' 的書包' : '小朋友的書包';
    await ensureCommonDataParent();
    await loadChildBackpack();
    initMQTT();
    startBackpackRealtime('parent');
}

async function loadChildBackpack() {
    const childId = currentUser.child;
    let record = null;
    try {
        record = await dbGet(APP_CONFIG.backpackPath + '/' + childId + '.json');
    } catch (e) {
        record = null;
    }
    record = normalizeBackpackRecord(record);

    prepareSmartPacking();
    itemsToPack.forEach(item => {
        item.scanned = typeof record.items[item.name] === 'boolean'
            ? record.items[item.name]
            : false;
    });

    const r = updateBackpackProgress('parent-progress-bar', 'parent-summary', itemsToPack);
    renderBackpackItems('parent-item-list', itemsToPack, false, null);
    drawBackpack('parent-backpack', r.packed, r.total);

    if (record.confirmed) {
        const sum = document.getElementById('parent-summary');
        if (sum) sum.textContent += '（小朋友已確認完成 ✅）';
    }
}

async function sendParentReminderBtn() {
    if (sendParentReminderBtn.busy) return;
    sendParentReminderBtn.busy = true;
    const btn = document.getElementById('parent-remind-btn');
    const btnLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
    try {
        const childId = currentUser.child;
        const childInfo = USERS[childId];
        let chatId = await getChatIdWithFallback(childId);
        if (!chatId) {
            showToast('小朋友尚未綁定 Telegram，請小朋友對 Bot 傳 /start ' + childId + '，或由老師在「設定」手動綁定', 'warn');
            return;
        }
        prepareSmartPacking();
        const packedNames = itemsToPack.filter(i => i.scanned).map(i => i.name);
        const lines = ['📚 ' + (childInfo ? childInfo.name : '小朋友') + '，快來收拾書包！'];
        if (itemsToPack.length > 0) {
            lines.push('今天要帶：');
            itemsToPack.forEach(item => {
                lines.push((item.scanned ? '✅ ' : '⬜ ') + item.name);
            });
        }
        try {
            await sendTelegram(chatId, lines.join('\n'));
            showToast('提醒已送出給小朋友！', 'success');
        } catch (e) {
            showToast('發送失敗：' + e.message + '\n請確認已設定 Bot Token', 'error');
        }
    } finally {
        sendParentReminderBtn.busy = false;
        if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
    }
}
