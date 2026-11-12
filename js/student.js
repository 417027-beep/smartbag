let myBackpackRecord = null;

async function ensureCommonData() {
    if (!scheduleData || scheduleData.length === 0) {
        loadMockData();
        try { await fetchScheduleData(); } catch(e) { console.warn('載入課表失敗，使用預設', e); renderTable(); prepareSmartPacking(); }
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
async function initStudentView() {
    document.getElementById('app-version').textContent = 'v' + APP_CONFIG.version;
    await ensureCommonData();
    await loadMyBackpack();
    initLedAnimMode();
    initMQTT();
}

function initLedAnimMode() {
    if (!currentUser || currentUser.role !== 'student') return;
    const select = document.getElementById('led-anim-mode');
    if (!select) return;
    select.value = localStorage.getItem('led_anim_mode_' + currentUser.id) || 'chick';
}

function onLedAnimModeChange() {
    if (!currentUser || currentUser.role !== 'student') return;
    const select = document.getElementById('led-anim-mode');
    if (!select) return;
    localStorage.setItem('led_anim_mode_' + currentUser.id, select.value);
    if (typeof publishLedAnimMode === 'function') publishLedAnimMode();
    if (typeof showToast === 'function') {
        showToast(select.value === 'blocks' ? 'LED 動畫：方塊疊疊樂' : 'LED 動畫：小雞吃飼料', 'success');
    }
}

async function loadMyBackpack() {
    let record = null;
    try {
        record = await dbGet(APP_CONFIG.backpackPath + '/' + currentUser.id + '.json');
    } catch (e) {
        record = null;
    }
    myBackpackRecord = normalizeBackpackRecord(record);
    prepareStudentItems();
}

function prepareStudentItems() {
    prepareSmartPacking();
    itemsToPack.forEach(item => {
        item.scanned = typeof myBackpackRecord.items[item.name] === 'boolean'
            ? myBackpackRecord.items[item.name]
            : false;
    });
    const r = updateBackpackProgress('student-progress-bar', 'student-summary', itemsToPack);
    renderBackpackItems('student-item-list', itemsToPack, true, toggleStudentItem);
    drawBackpack('student-backpack', r.packed, r.total);
    updateConfirmBtn();
    if (typeof publishPackedItemsToEsp === 'function') publishPackedItemsToEsp();
    if (typeof publishPackedCompleteToEsp === 'function') publishPackedCompleteToEsp();
}

async function toggleStudentItem(item) {
    item.scanned = !item.scanned;
    touchBackpackRecord(myBackpackRecord);
    myBackpackRecord.items[item.name] = item.scanned;
    try {
        await dbPut(APP_CONFIG.backpackPath + '/' + currentUser.id + '.json', myBackpackRecord);
    } catch (e) {
        console.error('儲存書包狀態失敗:', e);
    }
    prepareStudentItems();
}

function updateConfirmBtn() {
    const btn = document.getElementById('student-confirm-btn');
    if (!btn) return;
    const packed = itemsToPack.filter(i => i.scanned).length;
    const done = itemsToPack.length > 0 && packed === itemsToPack.length;
    btn.disabled = !done;
    btn.textContent = (myBackpackRecord && myBackpackRecord.confirmed && done)
        ? '✅ 已完成收拾'
        : '✅ 確認收拾完成';
}

async function confirmPacked() {
    const packed = itemsToPack.filter(i => i.scanned).length;
    if (packed !== itemsToPack.length) {
        alert('還有物品未收拾！');
        return;
    }
    touchBackpackRecord(myBackpackRecord);
    myBackpackRecord.confirmed = true;
    myBackpackRecord.confirmedAt = new Date().toISOString();
    try {
        await dbPut(APP_CONFIG.backpackPath + '/' + currentUser.id + '.json', myBackpackRecord);
    } catch (e) {
        console.error('儲存確認狀態失敗:', e);
    }
    const btn = document.getElementById('student-confirm-btn');
    btn.textContent = '✅ 已完成收拾';
    btn.disabled = true;
    notifyParentPacked();
}

async function notifyParentPacked() {
    const parentId = currentUser.parentId;
    if (!parentId) return;
    let chatId = await getChatIdWithFallback(parentId);
    if (!chatId) {
        console.warn('家長尚未綁定 Telegram：' + parentId);
        return;
    }
    const packedNames = itemsToPack.filter(i => i.scanned).map(i => i.name);
    const lines = ['🎒 ' + currentUser.name + ' 已經收拾好書包了！'];
    if (packedNames.length > 0) {
        lines.push('帶了：' + packedNames.join('、'));
    }
    lines.push('✅ 收拾時間：' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }));
    try {
        await sendTelegram(chatId, lines.join('\n'));
        console.log('已通知家長:', parentId);
    } catch (e) {
        console.error('通知家長失敗:', e);
    }
}