let teacherItems = [];

async function initTeacherView() {
    document.getElementById('app-version').textContent = 'v' + APP_CONFIG.version;
    document.getElementById('rtdb-url-input').value = getRtdbBase();

    updateClock();
    setInterval(updateClock, 1000);
    highlightToday();
    setInitialTargetDay();

    loadMockData();
    originalScheduleData = JSON.parse(JSON.stringify(scheduleData));
    renderTable();
    prepareSmartPacking();

    loadTgChats();
    seedDefaultChats(); // 開啟即保證有綁定
    refreshTeacherItems();
    initMQTT();

    await fetchScheduleData();
    refreshTeacherBackpacks();
    startBackpackRealtime('teacher');
}

function switchTeacherTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.getElementById('tab-schedule').classList.toggle('hidden', tabName !== 'schedule');
    document.getElementById('tab-backpack').classList.toggle('hidden', tabName !== 'backpack');
    if (tabName === 'backpack') refreshTeacherBackpacks();
}

async function addTeacherItem() {
    let name = document.getElementById('teacher-item-input').value.trim().slice(0, 30).replace(/[<>"']/g, '');
    const cat = document.getElementById('teacher-item-cat').value;
    if (!name) {
        alert('請輸入品項名稱');
        return;
    }
    if (teacherItems.some(i => i.name === name)) { alert('品項已存在'); return; }
    teacherItems.push({ name: name, category: cat });
    await saveTeacherItems();
    document.getElementById('teacher-item-input').value = '';
    refreshTeacherItems();
    prepareSmartPacking();
}

async function saveTeacherItems() {
    try {
        await dbPut(APP_CONFIG.teacherItemsPath, teacherItems);
    } catch (e) {
        console.error('儲存品項失敗:', e);
    }
}

async function refreshTeacherItems() {
    try {
        const data = await dbGet(APP_CONFIG.teacherItemsPath);
        teacherItems = Array.isArray(data) ? data : [];
    } catch (e) {
        teacherItems = [];
    }
    renderTeacherItems();
}

function renderTeacherItems() {
    const listEl = document.getElementById('teacher-item-list');
    if (!listEl) return;
    if (teacherItems.length === 0) {
        listEl.innerHTML = '<p style="color:#64748b;font-size:13px;">尚無品項，請在上方新增</p>';
        return;
    }
    listEl.innerHTML = '';
    teacherItems.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'teacher-item';
        const span = document.createElement('span');
        span.textContent = item.name + ' ';
        const em = document.createElement('em');
        em.textContent = '(' + item.category + ')';
        span.appendChild(em);
        row.appendChild(span);
        const del = document.createElement('button');
        del.className = 'btn btn-danger btn-sm';
        del.textContent = '刪除';
        del.onclick = async () => {
            teacherItems.splice(idx, 1);
            await saveTeacherItems();
            refreshTeacherItems();
            prepareSmartPacking();
        };
        row.appendChild(del);
        listEl.appendChild(row);
    });
}

function getTodayRequiredItems() {
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const daySelect = document.getElementById('target-day-select');
    let dayKey;
    if (daySelect && daySelect.value) {
        // 老師切換「檢測目標」時，全班儀表板同步比對該天的清單
        dayKey = daySelect.value;
    } else {
        const todayIdx = new Date().getDay();
        dayKey = (todayIdx >= 1 && todayIdx <= 5) ? dayMap[todayIdx] : 'mon';
    }

    const uniqueSubjects = new Set();
    (scheduleData || []).forEach(row => {
        if (row[dayKey]) uniqueSubjects.add(row[dayKey]);
    });

    const noBookSubjects = ['體育', '班會', '社團課'];
    const names = [];
    uniqueSubjects.forEach(sub => {
        if (!noBookSubjects.includes(sub)) names.push(sub + '課本');
        const config = SUBJECT_CONFIG[sub] || { equip: [] };
        if (config.equip) config.equip.forEach(eq => names.push(eq));
    });
    (teacherItems || []).forEach(item => {
        if (!names.includes(item.name)) names.push(item.name);
    });
    return names;
}

async function refreshTeacherBackpacks() {
    const grid = document.getElementById('teacher-backpacks');
    if (!grid) return;

    const required = getTodayRequiredItems();
    const total = required.length;

    const cards = [];
    for (const sid of STUDENTS) {
        let record = null;
        try {
            record = await dbGet(APP_CONFIG.backpackPath + '/' + sid + '.json');
        } catch (e) {
            record = null;
        }
        record = normalizeBackpackRecord(record);
        const info = USERS[sid];
        const items = record.items || {};
        const packed = required.filter(n => items[n]).length;
        const pct = total === 0 ? (record.confirmed ? 100 : 0) : Math.round((packed / total) * 100);

        let status, chipClass;
        if (record.confirmed) {
            status = '✅ 已完成';
            chipClass = 'status-chip done';
        } else if (total > 0 && packed === total) {
            status = '🎒 已備齊';
            chipClass = 'status-chip ready';
        } else {
            status = '⏳ 收拾中';
            chipClass = 'status-chip';
        }

        const missing = required.filter(n => !items[n]);
        let foot;
        if (total === 0) {
            foot = '今日免帶物品';
        } else if (missing.length === 0) {
            foot = packed + ' / ' + total + ' 項已裝妥';
        } else {
            foot = packed + ' / ' + total + ' 項已裝妥 · 缺：' +
                missing.slice(0, 3).join('、') +
                (missing.length > 3 ? ' 等 ' + missing.length + ' 項' : '');
        }

        const carried = Object.keys(items).filter(n => items[n]);
        const carriedLine = carried.length
            ? '已帶 ' + carried.length + ' 項：' + carried.slice(0, 6).join('、') + (carried.length > 6 ? ' 等' : '')
            : '尚未逼卡／尚未放入物品';

        cards.push(
            '<div class="backpack-card">' +
            '<div class="backpack-card-head"><strong>' + escapeHtml(info.name) + '</strong>' +
            '<span class="' + chipClass + '">' + escapeHtml(status) + '</span></div>' +
            '<div class="progress-container"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
            '<div class="backpack-card-foot">' + escapeHtml(foot) + '</div>' +
            '<div class="backpack-card-carried">' + escapeHtml(carriedLine) + '</div>' +
            '</div>'
        );
    }
    grid.innerHTML = cards.join('');
}

async function sendTeacherMessage() {
    const target = document.getElementById('msg-target').value;
    const text = document.getElementById('msg-input').value.trim();
    const resultEl = document.getElementById('msg-result');
    if (!text) {
        alert('請先輸入訊息內容');
        return;
    }
    if (!getTgToken()) {
        resultEl.textContent = '❌ 尚未設定 Bot Token，請點右上角「設定」填入 Telegram Bot Token 並儲存';
        resultEl.style.color = '#ef4444';
        alert('尚未設定 Telegram Bot Token，請到「設定」填入後再發送');
        return;
    }

    let accounts = [];
    if (target === 'parents') accounts = accounts.concat(PARENT_IDS);
    else if (target === 'students') accounts = accounts.concat(STUDENTS);
    else accounts.push(target);

    let sent = 0;
    const failed = [];
    const unbound = [];
    const seen = new Set();
    const skippedDuplicate = [];
    for (const acc of accounts) {
        let chatId = await getChatIdWithFallback(acc);
        if (!chatId) {
            unbound.push(acc);
            continue;
        }
        if (seen.has(String(chatId))) {
            skippedDuplicate.push(acc);
            continue; // 同一 Chat 去重，不重複發送也不算失敗
        }
        seen.add(String(chatId));
        try {
            await sendTelegram(chatId, text);
            sent++;
        } catch (e) {
            console.error('發送失敗', acc, e);
            failed.push(acc + '(' + e.message + ')');
        }
    }

    document.getElementById('msg-input').value = '';
    if (sent > 0) {
        let msg = '✅ 已發送給 ' + sent + ' 個聊天（去重後）';
        if (skippedDuplicate.length) msg += '，' + skippedDuplicate.length + ' 個帳號共用同一聊天已去重：' + skippedDuplicate.join('、');
        const problems = [];
        if (unbound.length) problems.push('未綁定：' + unbound.join('、'));
        if (failed.length) problems.push('發送失敗：' + failed.join('、'));
        if (problems.length) msg += '（' + problems.join('；') + '）';
        else if (skippedDuplicate.length) msg += '（其餘為復用 ID，替換真實 ID 後可分別送達）';
        resultEl.textContent = msg;
        resultEl.style.color = (unbound.length || failed.length) ? '#f59e0b' : '#10b981';
    } else {
        if (skippedDuplicate.length && failed.length === 0 && unbound.length === 0) {
            resultEl.textContent = '⚠️ 目標帳號共用同一聊天，訊息已送達該聊天（請到 js/config.js 替換為真實 Chat ID 以分別送達）';
            resultEl.style.color = '#f59e0b';
        } else {
            const parts = [];
            if (unbound.length) parts.push('未綁定 Telegram：' + unbound.join('、'));
            if (failed.length) parts.push('發送失敗：' + failed.join('、'));
            resultEl.textContent = '❌ ' + parts.join('；');
            resultEl.style.color = '#ef4444';
        }
    }
}

async function sendClassReport() {
    const token = getTgToken();
    if (!token) {
        alert('請先到「設定」儲存 Telegram Bot Token');
        return;
    }

    const lines = ['📋 班級書包報告'];
    const required = getTodayRequiredItems();
    const total = required.length;
    let sentCount = 0;

    const sentParentChats = new Set();
    for (const sid of STUDENTS) {
        const info = USERS[sid];
        let record = null;
        try {
            record = await dbGet(APP_CONFIG.backpackPath + '/' + sid + '.json');
        } catch (e) {
            record = null;
        }
        record = normalizeBackpackRecord(record);
        const items = record.items || {};
        const packed = required.filter(n => items[n]).length;
        let state;
        if (record.confirmed) state = '✅ 已完成確認';
        else if (total > 0 && packed === total) state = '🎒 已備齊';
        else if (total === 0) state = '今日免帶';
        else state = '⏳ ' + packed + '/' + total;
        lines.push(info.name + '：' + state);

        if (info.parentId) {
            let chatId = await getChatIdWithFallback(info.parentId);
            if (chatId && !sentParentChats.has(String(chatId))) {
                sentParentChats.add(String(chatId));
                try {
                    await sendTelegram(chatId, info.name + ' 的書包狀態：' + state);
                    sentCount++;
                } catch (e) {
                    console.error('發送給家長失敗:', e);
                }
            }
        }
    }

    let tchat = await getChatIdWithFallback('tea');

    if (tchat) {
        try {
            await sendTelegram(tchat, lines.join('\n'));
            alert('班級報告已送出！');
        } catch (e) {
            alert('教師報告發送失敗：' + e.message);
        }
    } else {
        alert('已發送給 ' + sentCount + ' 位已綁定的家長。\n你尚未綁定教師聊天，可在設定中綁定 tea → 你的 Chat ID。');
    }
}