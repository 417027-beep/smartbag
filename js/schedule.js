let scheduleData = [];
let originalScheduleData = [];
let hasUnsavedChanges = false;
let autoSaveTimer = null;
let editingCell = { periodIndex: -1, dayKey: '', dayName: '' };

const defaultSubjectStyle = { icon: 'fa-book-open', color: 'bg-gray-50 text-gray-700 border-gray-200', equip: [] };

function updateClock() {
    const el = document.getElementById('current-time-display');
    if (!el) return;
    const now = new Date();
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    el.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 ' +
        days[now.getDay()] + ' ' +
        now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

function highlightToday() {
    let today = new Date().getDay();
    if (today === 0 || today === 6) today = 1; // 星期六日視同星期一
    if (today < 1 || today > 5) return;
    const targetTh = document.querySelector('th[data-day="' + today + '"]');
    if (targetTh) {
        targetTh.style.background = '#6366f1';
        targetTh.style.color = '#ffffff';
    }
}

function setInitialTargetDay() {
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayIdx = new Date().getDay();
    const target = (todayIdx >= 1 && todayIdx <= 5) ? dayMap[todayIdx] : 'mon';
    const select = document.getElementById('target-day-select');
    if (select) select.value = target;
}

function updateStatusBadge(type, text) {
    const badge = document.getElementById('status-badge');
    if (!badge) return;
    if (type === 'success') {
        badge.style.background = '#d1fae5';
        badge.style.color = '#065f46';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full" style="background:#10b981;"></span> ' + text;
    } else if (type === 'loading') {
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full animate-pulse" style="background:#f59e0b;"></span> ' + text;
    } else {
        badge.style.background = '#fee2e2';
        badge.style.color = '#991b1b';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full" style="background:#ef4444;"></span> ' + text;
    }
}

function getSubjectInfo(subjectName) {
    if (!subjectName) return null;
    if (SUBJECT_CONFIG[subjectName]) return { ...SUBJECT_CONFIG[subjectName], name: subjectName };
    for (let key in SUBJECT_CONFIG) {
        if (subjectName.includes(key)) return { ...SUBJECT_CONFIG[key], name: subjectName };
    }
    return { ...defaultSubjectStyle, name: subjectName };
}

function loadMockData() {
    scheduleData = [
        { period: '第 1 節', mon: '物理', tue: '地理', wed: '基本電子實習', thu: '基本電學', fri: '音樂' },
        { period: '第 2 節', mon: '物理', tue: '地理', wed: '基本電子實習', thu: '英語文', fri: '閩南語文' },
        { period: '第 3 節', mon: '資訊科技', tue: '英語文', wed: '基本電子實習', thu: '數學', fri: '體育' },
        { period: '第 4 節', mon: '資訊科技', tue: '基本電學', wed: '基本電子實習', thu: '數學', fri: '體育' },
        { period: '第 5 節', mon: '國語文', tue: '數學', wed: '班會', thu: '音樂', fri: '英文句型' },
        { period: '第 6 節', mon: '國語文', tue: '健康與護理', wed: '社團課', thu: '美術', fri: '英文句型' },
        { period: '第 7 節', mon: '基本電學', tue: '全民國防', wed: '社團課', thu: '國語文', fri: '數學' }
    ];
}

function generateRandomData() {
    const subjects = Object.keys(SUBJECT_CONFIG);
    const newData = [];
    for (let p = 1; p <= 8; p++) {
        const row = { period: '第 ' + p + ' 節', mon: '', tue: '', wed: '', thu: '', fri: '' };
        ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(day => {
            const dailyCounts = {};
            for (let r = 0; r < p - 1; r++) {
                const s = newData[r] ? newData[r][day] : null;
                if (s) dailyCounts[s] = (dailyCounts[s] || 0) + 1;
            }
            const allowed = subjects.filter(s => {
                if (s !== '國語文' && s !== '數學') return true;
                return (dailyCounts[s] || 0) < 2;
            });
            row[day] = allowed[Math.floor(Math.random() * allowed.length)];
        });
        newData.push(row);
    }
    return newData;
}

function resetToDefaultSchedule() {
    if (!confirm('確定要將課表重設為預設課表嗎？\n目前的雲端課表會被覆蓋。')) return;
    loadMockData();
    originalScheduleData = JSON.parse(JSON.stringify(scheduleData));
    hasUnsavedChanges = true;
    renderTable();
    prepareSmartPacking();
    afterScheduleChange();
    updateStatusBadge('success', '已重設為預設課表');
}

function generateRandomSchedule() {
    const origJson = JSON.stringify(originalScheduleData);
    let attempts = 0;
    do {
        scheduleData = generateRandomData();
        attempts++;
    } while (JSON.stringify(scheduleData) === origJson && attempts < 20);
    hasUnsavedChanges = true;
    renderTable();
    prepareSmartPacking();
    afterScheduleChange();
}

function renderTable() {
    const tbody = document.getElementById('schedule-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const today = new Date().getDay();

    scheduleData.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.className = 'border-t transition-colors';
        tr.style.borderColor = '#334155';
        let html = '<td class="p-3 text-center text-sm font-medium" style="color:#64748b;">' + row.period + '</td>';
        ['mon', 'tue', 'wed', 'thu', 'fri'].forEach((day, dayIndex) => {
            const subjectRaw = row[day];
            const info = getSubjectInfo(subjectRaw);
            const isToday = (today === dayIndex + 1);
            const tdClass = 'p-1 sm:p-2 editable-cell cursor-pointer';
            if (subjectRaw) {
                html += '<td class="' + tdClass + '" onclick="openSubjectModal(' + index + ', \'' + day + '\')">' +
                    '<div class="subject-card p-2 rounded-xl border text-center h-full flex flex-col justify-center items-center gap-1 ' +
                    (isToday ? 'bg-indigo-500 text-white border-indigo-400' : info.color) + '">' +
                    '<i class="fas ' + info.icon + ' text-base sm:text-lg"></i>' +
                    '<span class="text-xs sm:text-sm font-bold truncate max-w-full">' + info.name + '</span></div></td>';
            } else {
                html += '<td class="' + tdClass + '" onclick="openSubjectModal(' + index + ', \'' + day + '\')">' +
                    '<div class="subject-card p-2 rounded-xl border border-dashed text-center h-full flex flex-col justify-center items-center gap-1" style="border-color:#334155;color:#64748b;">' +
                    '<i class="fas fa-plus text-xs"></i><span class="text-xs">空堂</span></div></td>';
            }
        });
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}

function openSubjectModal(periodIndex, dayKey) {
    const dayNames = { 'mon': '星期一', 'tue': '星期二', 'wed': '星期三', 'thu': '星期四', 'fri': '星期五' };
    editingCell = { periodIndex, dayKey, dayName: dayNames[dayKey] };
    document.getElementById('editing-cell-info').textContent =
        '正在修改：' + dayNames[dayKey] + ' ' + scheduleData[periodIndex].period;

    const grid = document.getElementById('subject-modal-grid');
    if (grid.children.length === 0) {
        grid.innerHTML = '<button onclick="updateSubject(\'\')" class="p-2 text-sm border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-100 text-gray-500 flex flex-col items-center gap-1 transition-colors"><i class="fas fa-times"></i><span>空堂</span></button>';
        Object.keys(SUBJECT_CONFIG).forEach(sub => {
            const info = SUBJECT_CONFIG[sub];
            grid.innerHTML += '<button onclick="updateSubject(\'' + sub + '\')" class="p-2 text-sm border rounded-xl hover:shadow-md flex flex-col items-center justify-center gap-1 transition-all ' +
                info.color + '"><i class="fas ' + info.icon + ' text-lg"></i><span>' + sub + '</span></button>';
        });
    }
    document.getElementById('subject-modal').classList.remove('hidden');
}

function closeSubjectModal() {
    document.getElementById('subject-modal').classList.add('hidden');
}

function updateSubject(newSubject) {
    if (editingCell.periodIndex === -1) return;
    const dayKey = editingCell.dayKey;

    if (newSubject === '國語文' || newSubject === '數學') {
        let count = 0;
        scheduleData.forEach((row, idx) => {
            if (idx !== editingCell.periodIndex && row[dayKey] === newSubject) count++;
        });
        if (count >= 2) {
            alert('課表限制：' + editingCell.dayName + '的「' + newSubject + '」一天不能超過兩節！');
            return;
        }
    }

    scheduleData[editingCell.periodIndex][dayKey] = newSubject;
    hasUnsavedChanges = true;
    renderTable();
    prepareSmartPacking();
    closeSubjectModal();
    afterScheduleChange();
}

function afterScheduleChange() {
    const autosave = document.getElementById('autosave-toggle');
    if (autosave && autosave.checked) {
        triggerAutoSave();
    } else {
        showSaveButton('儲存修改至 Firebase');
    }
}

function showSaveButton(text) {
    const saveBtn = document.getElementById('save-btn');
    if (!saveBtn) return;
    document.getElementById('save-btn-text').textContent = text;
    saveBtn.classList.remove('hidden');
    saveBtn.classList.add('animate-pulse');
}

function triggerAutoSave() {
    const saveBtn = document.getElementById('save-btn');
    if (!saveBtn) return;
    document.getElementById('save-btn-text').textContent = '即將自動儲存...';
    saveBtn.classList.remove('hidden');
    updateStatusBadge('loading', '等待儲存中...');
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        saveToCloud();
    }, 1000);
}

function csvEscape(field) {
    const s = String(field || '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}
function exportToExcel() {
    let csvContent = '\uFEFF';
    csvContent += '節次,星期一,星期二,星期三,星期四,星期五\n';
    scheduleData.forEach(row => {
        csvContent += [row.period, row.mon, row.tue, row.wed, row.thu, row.fri].map(csvEscape).join(',') + '\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', '智慧書包_課表.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function parseCSVLine(line) {
    const res = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQ && line[i+1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (c === ',' && !inQ) { res.push(cur); cur = ''; }
        else cur += c;
    }
    res.push(cur);
    return res.map(s => s.trim());
}

function triggerExcelImport() {
    document.getElementById('excel-file-input').click();
}

function parseCSV(csv) {
    // 移除 BOM 並統一換行
    csv = csv.replace(/^\uFEFF/, '').replace(/\r/g, '');
    const rows = csv.split('\n');
    scheduleData = [];
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
        if (count >= 8) break;
        if (!rows[i].trim()) continue;
        const cols = parseCSVLine(rows[i]);
        if (cols.length >= 6) {
            // 防 XSS：限制欄位長度並去除危險字元
            const safe = cols.map(c => c.slice(0, 30).replace(/[<>"']/g, ''));
            scheduleData.push({ period: safe[0] || '第 ' + (count + 1) + ' 節', mon: safe[1] || '', tue: safe[2] || '', wed: safe[3] || '', thu: safe[4] || '', fri: safe[5] || '' });
            count++;
        }
    }
    while (scheduleData.length < 8) {
        scheduleData.push({ period: '第 ' + (scheduleData.length + 1) + ' 節', mon: '', tue: '', wed: '', thu: '', fri: '' });
    }
}

function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        parseCSV(e.target.result);
        hasUnsavedChanges = true;
        renderTable();
        prepareSmartPacking();
        afterScheduleChange();
    };
    reader.readAsText(file);
    event.target.value = '';
}