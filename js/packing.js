let itemsToPack = [];
let selectedPackingStudent = '';
let packingLiveBackup = null;
let packingDayKey = '';
let teacherDayManual = false;

function todayPackingDayKey() {
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayIdx = new Date().getDay();
    return (todayIdx >= 1 && todayIdx <= 5) ? dayMap[todayIdx] : 'mon';
}

// 學生/家長頁沒有日期選單，一律用今天；避免頁面跨日後還沿用昨天的清單
function ensurePackingForToday() {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    if (packingDayKey === todayPackingDayKey()) return;
    itemsToPack = [];
    packingLiveBackup = null;
    if (typeof setInitialTargetDay === 'function') setInitialTargetDay();
    prepareSmartPacking();
}

function refreshPackingDayIfNeeded() {
    if (typeof currentUser === 'undefined' || !currentUser) return false;
    if (!packingDayKey || packingDayKey === todayPackingDayKey()) return false;
    if (currentUser.role === 'teacher') {
        if (teacherDayManual) return false;
        const sel = document.getElementById('target-day-select');
        if (sel) sel.value = todayPackingDayKey();
        itemsToPack = [];
        prepareSmartPacking();
        if (typeof refreshTeacherBackpacks === 'function') refreshTeacherBackpacks();
        return true;
    }
    itemsToPack = [];
    packingLiveBackup = null;
    if (currentUser.role === 'student') loadMyBackpack();
    else loadChildBackpack();
    return true;
}

function onTargetDayChange() {
    teacherDayManual = true;
    prepareSmartPacking();
    if (typeof refreshTeacherBackpacks === 'function') refreshTeacherBackpacks();
}

function initPackingStudentSelect() {
    const sel = document.getElementById('packing-student-select');
    if (!sel || sel.dataset.ready === '1') return;
    const list = (typeof STUDENTS !== 'undefined') ? STUDENTS : [];
    list.forEach(sid => {
        const opt = document.createElement('option');
        opt.value = sid;
        opt.textContent = (USERS[sid] && USERS[sid].name) ? USERS[sid].name : sid;
        sel.appendChild(opt);
    });
    sel.dataset.ready = '1';
    if (!selectedPackingStudent && sel.value) selectedPackingStudent = sel.value;
}

async function onPackingStudentChange() {
    const sel = document.getElementById('packing-student-select');
    selectedPackingStudent = sel ? sel.value : '';
    await applyPackingStudentView();
}

// 唯讀：載入所選學生在 Firebase 的書包紀錄並覆蓋打勾狀態
async function applyPackingStudentView() {
    const badge = document.getElementById('packing-student-badge');
    if (!selectedPackingStudent) {
        // 回到即時感應：還原進入檢視前的狀態
        if (packingLiveBackup) {
            itemsToPack.forEach(item => {
                if (packingLiveBackup.has(item.name)) item.scanned = packingLiveBackup.get(item.name);
            });
            packingLiveBackup = null;
        }
        if (badge) badge.style.display = 'none';
        renderPackingList();
        updateWeightAndLED();
        return;
    }
    if (!packingLiveBackup) {
        packingLiveBackup = new Map(itemsToPack.map(i => [i.name, i.scanned]));
    }
    let record = null;
    try {
        record = await dbGet(APP_CONFIG.backpackPath + '/' + selectedPackingStudent + '.json');
    } catch (e) {
        record = null;
    }
    record = normalizeBackpackRecord(record);
    const items = record.items;
    itemsToPack.forEach(item => { item.scanned = !!items[item.name]; });
    if (badge) {
        const info = USERS[selectedPackingStudent] || { name: selectedPackingStudent };
        badge.style.display = '';
        badge.textContent = '👁 檢視 ' + info.name + ' 的收拾狀況' +
            (record && record.confirmed ? '（已確認完成）' : '（唯讀）');
    }
    renderPackingList();
    updateWeightAndLED();
}

// 依指定星期產生需攜帶清單（不含打勾狀態）
function buildPackingItemsForDay(dayKey) {
    const uniqueSubjects = new Set();
    (scheduleData || []).forEach(row => {
        if (row[dayKey]) uniqueSubjects.add(row[dayKey]);
    });

    const noBookSubjects = ['體育', '班會', '社團課'];
    const items = [];

    uniqueSubjects.forEach(sub => {
        if (!noBookSubjects.includes(sub)) {
            items.push({ name: sub + '課本', matchKey: sub, type: 'book' });
        }
        const config = SUBJECT_CONFIG[sub] || { equip: [] };
        if (config.equip) {
            config.equip.forEach(eq => {
                if (!items.some(i => i.name === eq)) {
                    items.push({ name: eq, matchKey: eq, type: 'equip' });
                }
            });
        }
    });

    (teacherItems || []).forEach(item => {
        if (!items.some(i => i.name === item.name)) {
            items.push({ name: item.name, matchKey: item.name, type: 'equip' });
        }
    });

    // 每天必帶物品（水壺、鉛筆盒），固定顯示在清單最上方
    const dailyItems = [];
    (DAILY_ITEMS || []).forEach(eq => {
        if (!items.some(i => i.name === eq)) {
            dailyItems.push({ name: eq, matchKey: eq, type: 'equip' });
        }
    });
    return dailyItems.concat(items);
}

function prepareSmartPacking() {
    const select = document.getElementById('target-day-select');
    // 學生/家長頁沒有「檢測目標」選單：一律用今天（週末則用星期一）
    const isTeacher = (typeof currentUser !== 'undefined') && currentUser && currentUser.role === 'teacher';
    const targetDayKey = (isTeacher && select) ? select.value : todayPackingDayKey();
    packingDayKey = targetDayKey;

    initPackingStudentSelect();
    const oldMap = new Map(itemsToPack.map(item => [item.name, item.scanned]));
    itemsToPack = buildPackingItemsForDay(targetDayKey).map(item => ({
        ...item,
        scanned: oldMap.get(item.name) || false
    }));

    const mqttSelect = document.getElementById('mqtt-test-subject');
    if (mqttSelect) {
        const testKeys = [...new Set(itemsToPack.map(i => i.matchKey))];
        mqttSelect.innerHTML = '';
        if (testKeys.length) {
            testKeys.forEach(k => {
                const opt = document.createElement('option');
                opt.value = k; opt.textContent = k;
                mqttSelect.appendChild(opt);
            });
        } else {
            const opt = document.createElement('option');
            opt.value = ''; opt.textContent = '無目標物品';
            mqttSelect.appendChild(opt);
        }
    }

    renderPackingList();
    updateWeightAndLED();
    if (select && selectedPackingStudent) applyPackingStudentView(); // 只有老師頁面才需要套用所選學生檢視
    if (typeof publishScheduleToEsp === 'function') publishScheduleToEsp(); // 清單有變就通知 ESP32
}

function showToast(message, type) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, 4500);
}

function renderPackingList() {
    const listEl = document.getElementById('packing-list');
    if (!listEl) return;
    if (itemsToPack.length === 0) {
        listEl.innerHTML = '<li class="text-gray-400 text-center py-4">本日無課程，免帶書包！ 🎉</li>';
        return;
    }
    listEl.innerHTML = '';
    itemsToPack.forEach(item => {
        const icon = item.scanned ? 'fa-check-circle' : 'fa-circle';
        const iconColor = item.scanned ? '#4ade80' : '#64748b';
        const textClass = item.scanned ? 'line-through' : '';
        const textColor = item.scanned ? '#94a3b8' : '#f1f5f9';
        const badge = item.type === 'book'
            ? '<span style="font-size:10px;background:rgba(59,130,246,0.3);color:#93c5fd;padding:1px 6px;border-radius:6px;">課本</span>'
            : '<span style="font-size:10px;background:rgba(245,158,11,0.3);color:#fcd34d;padding:1px 6px;border-radius:6px;">裝備</span>';
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between';
        li.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.05);padding:8px 0;font-size:14px;font-weight:500;';
        const left = document.createElement('div');
        left.className = 'flex items-center gap-2';
        const iconEl = document.createElement('i');
        iconEl.className = 'fas ' + icon;
        iconEl.style.color = iconColor;
        const span = document.createElement('span');
        span.className = textClass;
        span.style.color = textColor;
        span.textContent = item.name;
        left.appendChild(iconEl); left.appendChild(span);
        li.appendChild(left);
        const badgeSpan = document.createElement('span');
        badgeSpan.style.cssText = item.type==='book' ? 'font-size:10px;background:rgba(59,130,246,0.3);color:#93c5fd;padding:1px 6px;border-radius:6px;' : 'font-size:10px;background:rgba(245,158,11,0.3);color:#fcd34d;padding:1px 6px;border-radius:6px;';
        badgeSpan.textContent = item.type==='book' ? '課本' : '裝備';
        li.appendChild(badgeSpan);
        listEl.appendChild(li);
    });
}

function checkPackingComplete() {
    const missingItems = itemsToPack.filter(item => !item.scanned);
    const bodyEl = document.getElementById('result-modal-body');
    const scopeName = (selectedPackingStudent && USERS[selectedPackingStudent])
        ? USERS[selectedPackingStudent].name + ' · ' : '';
    document.getElementById('result-modal-title').textContent =
        missingItems.length === 0
            ? (itemsToPack.length === 0 ? '盤點結果' : scopeName + '盤點成功 🎉')
            : scopeName + '盤點未完成 ⚠️';

    if (itemsToPack.length === 0) {
        bodyEl.innerHTML = '<div class="text-indigo-400 mb-3"><i class="fas fa-calendar-day fa-3x"></i></div><p class="font-bold text-gray-800 text-lg">本日放假！</p>';
    } else if (missingItems.length === 0) {
        bodyEl.innerHTML = '<div class="text-green-500 mb-3"><i class="fas fa-check-circle fa-3x"></i></div><p class="font-bold text-gray-800 text-lg">完美！所有物品已備齊</p>';
    } else {
        bodyEl.innerHTML = '<div class="text-red-500 mb-3"><i class="fas fa-exclamation-triangle fa-3x"></i></div><p class="font-bold text-gray-800 text-lg">哎呀！漏掉一些東西了</p>';
        const ul = document.createElement('ul');
        ul.style.cssText = 'text-align:left;max-height:130px;overflow-y:auto;background:#f8fafc;padding:12px;border-radius:12px;';
        missingItems.forEach(item => {
            const li2 = document.createElement('li');
            li2.style.cssText = 'color:#ef4444;font-size:14px;';
            li2.textContent = '• ' + item.name;
            ul.appendChild(li2);
        });
        bodyEl.appendChild(ul);
    }
    document.getElementById('result-modal').classList.remove('hidden');
}

function closeResultModal() {
    document.getElementById('result-modal').classList.add('hidden');
}

function updateWeightAndLED() {
    const ledInd = document.getElementById('led-indicator');
    const ledText = document.getElementById('led-text');
    if (!ledInd || !ledText) return;

    const missingItems = itemsToPack.filter(item => !item.scanned);
    if (itemsToPack.length === 0) {
        ledInd.style.background = '#60a5fa';
        ledText.style.color = '#60a5fa';
        ledText.textContent = '放假模式';
    } else if (missingItems.length === 0) {
        ledInd.style.background = '#4ade80';
        ledText.style.color = '#4ade80';
        ledText.textContent = '安全備齊';
    } else {
        ledInd.style.background = '#facc15';
        ledText.style.color = '#facc15';
        ledText.textContent = '缺 ' + missingItems.length + ' 項';
    }
}