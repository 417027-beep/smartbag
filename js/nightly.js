// 每晚 22:00 自動偵測書包並提醒小朋友
const NIGHTLY_HOUR = 22;
const NIGHTLY_MINUTE = 0;

function getRequiredItemsForDay(dayKey) {
    const uniqueSubjects = new Set();
    (scheduleData || []).forEach(row => { if (row[dayKey]) uniqueSubjects.add(row[dayKey]); });
    const noBookSubjects = ['體育', '班會', '社團課'];
    const names = [];
    uniqueSubjects.forEach(sub => {
        if (!noBookSubjects.includes(sub)) names.push(sub + '課本');
        const cfg = SUBJECT_CONFIG[sub] || { equip: [] };
        if (cfg.equip) cfg.equip.forEach(eq => { if (!names.includes(eq)) names.push(eq); });
    });
    (teacherItems || []).forEach(item => { if (!names.includes(item.name)) names.push(item.name); });
    return names;
}

function getTomorrowDayKey() {
    const dayMap = ['sun','mon','tue','wed','thu','fri','sat'];
    let d = new Date();
    // 22:00 是為「明天」準備，若明天是六日則順延到星期一
    d.setDate(d.getDate() + 1);
    let idx = d.getDay();
    if (idx === 0 || idx === 6) {
        // 調到下週一
        const daysUntilMon = (8 - idx) % 7;
        d.setDate(d.getDate() + daysUntilMon);
        idx = 1;
    }
    return dayMap[idx];
}

function getTomorrowLabel() {
    const map = {mon:'星期一',tue:'星期二',wed:'星期三',thu:'星期四',fri:'星期五'};
    return map[getTomorrowDayKey()] || '明天';
}

async function sendNightlyReminders(isManual = false) {
    const required = getRequiredItemsForDay(getTomorrowDayKey());
    const tomorrowLabel = getTomorrowLabel();
    if (required.length === 0) {
        console.log('[Nightly] 明天無課，不需提醒');
        if (isManual) showToast('明天無課，不需提醒', 'success');
        return { sent: 0, skipped: STUDENTS.length, required: [] };
    }
    let sent = 0;
    let skipped = 0;
    const results = [];
    for (const sid of STUDENTS) {
        const info = USERS[sid];
        let record = null;
        try { record = await dbGet(APP_CONFIG.backpackPath + '/' + sid + '.json'); } catch(e) { record = null; }
        record = normalizeBackpackRecord(record);
        const items = record.items || {};
        const missing = required.filter(n => !items[n]);
        const isDone = missing.length === 0 && (required.length > 0);
        // 若已確認完成且已備齊，則不打擾
        if (record.confirmed && isDone) {
            skipped++;
            results.push(info.name + '：已完成，跳過');
            continue;
        }
        let chatId = await getChatIdWithFallback(sid);
        if (!chatId) {
            results.push(info.name + '：未綁定，無法提醒');
            continue;
        }
        let text;
        if (missing.length === 0) {
            text = `🌙 ${info.name}，晚安！\n明天（${tomorrowLabel}）要帶的 ${required.length} 項已全部備齊，很棒！\n✅ ${required.join('、')}`;
        } else {
            text = `🌙 ${info.name}，晚上10點提醒！\n明天（${tomorrowLabel}）要帶：\n${required.map(n => missing.includes(n) ? '⬜ ' + n : '✅ ' + n).join('\n')}\n\n還有 ${missing.length} 項未收：${missing.join('、')}\n快去收拾書包吧！🎒`;
        }
        try {
            await sendTelegram(chatId, text);
            sent++;
            results.push(info.name + '：已提醒' + (missing.length ? `（缺${missing.length}項）` : '（已備齊）'));
        } catch(e) {
            results.push(info.name + '：發送失敗 ' + e.message);
        }
    }
    console.log('[Nightly] 結果', results);
    if (isManual) {
        showToast(`已發送 ${sent} 位，跳過 ${skipped} 位`, sent > 0 ? 'success' : 'warn');
        // 顯示詳細結果在 teacher 的 msg-result 若存在
        const el = document.getElementById('msg-result');
        if (el) el.textContent = `🌙 22:00 定時提醒（手動測試）：已發送 ${sent} 位，跳過 ${skipped} 位\n` + results.join(' | ');
    }
    return { sent, skipped, required, results };
}

function initNightlyScheduler() {
    if (APP_CONFIG.nightlyBrowserReminder === false) {
        const hintEl = document.getElementById('nightly-hint');
        if (hintEl) hintEl.textContent = '⏰ 每晚 22:00 與每天早上 06:00 由本機排程自動提醒（關閉網頁也會發送）';
        console.log('[Nightly] 瀏覽器自動提醒已停用，使用 nightly-poller.py 排程');
        return;
    }
    const check = async () => {
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const lastSent = localStorage.getItem('nightly_sent_date');
        // 顯示下次提醒時間
        const hintEl = document.getElementById('nightly-hint');
        if (hintEl) {
            const tomorrow = getTomorrowLabel();
            hintEl.textContent = `⏰ 每晚 22:00 自動檢測明天（${tomorrow}）書包並提醒小朋友｜上次發送：${lastSent || '尚未發送'}`;
        }
        if (now.getHours() === NIGHTLY_HOUR) {
            if (lastSent === todayKey) return; // 今天已發過
            // 確保課表已載入
            if (!scheduleData || scheduleData.length === 0) {
                console.log('[Nightly] 課表尚未載入，延後 1 分鐘');
                return;
            }
            console.log('[Nightly] 觸發 22:00 定時提醒');
            localStorage.setItem('nightly_sent_date', todayKey);
            await sendNightlyReminders(false);
        }
    };
    // 每 60 秒檢查一次；分頁重新可見時也立刻補檢查
    setInterval(check, 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    check();
    console.log('[Nightly] 已啟動，每晚 22:00 自動提醒');
}

// 手動測試按鈕用
async function testNightlyReminder() {
    const btn = document.getElementById('nightly-test-btn');
    if (btn) { btn.disabled = true; btn.textContent = '發送中…'; }
    try {
        await sendNightlyReminders(true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🌙 立即測試 22:00 提醒'; }
    }
}
