function normalizeRtdbUrl(url) {
    let u = (url || '').trim().replace(/\/+$/, '');
    if (u.indexOf('/schedule.json') !== -1) {
        u = u.replace('/schedule.json', '');
    }
    return u;
}

function getRtdbBase() {
    return localStorage.getItem('rtdb_base') || APP_CONFIG.defaultRtdbBase;
}

async function dbGet(path) {
    const res = await fetch(getRtdbBase() + '/' + path);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}

async function dbPut(path, data) {
    const res = await fetch(getRtdbBase() + '/' + path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}

async function fetchScheduleData() {
    if (!document.getElementById('status-badge')) return;

    updateStatusBadge('loading', '同步 Firebase 中...');
    try {
        const data = await dbGet(APP_CONFIG.schedulePath);
        if (Array.isArray(data) && data.length > 0) {
            scheduleData = data;
        } else {
            loadMockData();
            await saveToCloud();
        }
        originalScheduleData = JSON.parse(JSON.stringify(scheduleData));
        updateStatusBadge('success', '已同步 Firebase 課表');
    } catch (e) {
        console.error('Firebase 讀取失敗:', e);
        updateStatusBadge('error', 'Firebase 連線失敗');
        if (!scheduleData || scheduleData.length === 0) loadMockData();
    }
    renderTable();
    prepareSmartPacking();
}

async function saveToCloud() {
    const saveBtn = document.getElementById('save-btn');
    const saveIcon = document.getElementById('save-icon');
    const saveText = document.getElementById('save-btn-text');

    if (saveBtn && !saveBtn.classList.contains('hidden')) {
        saveIcon.className = 'fas fa-spinner fa-spin';
        saveText.textContent = '寫入 Firebase 中...';
        saveBtn.classList.add('pointer-events-none', 'opacity-60');
    }
    updateStatusBadge('loading', '寫入 Firebase 中...');

    try {
        await dbPut(APP_CONFIG.schedulePath, scheduleData);
        updateStatusBadge('success', '已成功寫入 Firebase');
        hasUnsavedChanges = false;
        if (saveBtn) {
            saveBtn.classList.add('hidden');
            saveBtn.classList.remove('pointer-events-none', 'opacity-60');
        }
    } catch (e) {
        console.error('儲存至 Firebase 失敗:', e);
        updateStatusBadge('error', 'Firebase 寫入失敗');
        if (saveIcon) {
            saveIcon.className = 'fas fa-cloud-upload-alt';
            saveText.textContent = '重試儲存至 Firebase';
            saveBtn.classList.remove('hidden', 'pointer-events-none', 'opacity-60');
            saveBtn.classList.add('animate-pulse');
        }
    }
}

async function testFirebaseConnection() {
    const btn = document.getElementById('test-connection-btn');
    const icon = document.getElementById('test-icon');
    const resultBox = document.getElementById('test-result-box');
    const urlInput = document.getElementById('rtdb-url-input').value.trim();

    if (!urlInput) {
        resultBox.className = 'block text-xs font-mono p-3 rounded-lg bg-red-100 text-red-800 border border-red-200';
        resultBox.innerHTML = '<strong>測試失敗：</strong><br>請輸入 Firebase Realtime Database URL！';
        return;
    }

    icon.className = 'fas fa-spinner fa-spin';
    btn.classList.add('pointer-events-none', 'opacity-60');
    resultBox.className = 'block text-xs font-mono p-3 rounded-lg bg-gray-100 text-gray-700 border border-gray-200';
    resultBox.innerHTML = '正在測試與 Firebase 的連線...';

    try {
        const res = await fetch(normalizeRtdbUrl(urlInput) + '/' + APP_CONFIG.schedulePath);
        if (!res.ok) throw new Error('HTTP 狀態碼: ' + res.status);
        localStorage.setItem('rtdb_base', normalizeRtdbUrl(urlInput));
        resultBox.className = 'block text-xs font-mono p-3 rounded-lg bg-green-100 text-green-800 border border-green-200';
        resultBox.innerHTML = '<strong>連線成功！</strong><br>Firebase Realtime Database API 運作正常！';
    } catch (err) {
        console.error('Test connection failed:', err);
        resultBox.className = 'block text-xs font-mono p-3 rounded-lg bg-red-100 text-red-800 border border-red-200';
        resultBox.innerHTML = '<strong>連線失敗</strong><br>錯誤原因：<span class="font-bold">' + (err.message || err) + '</span><br>請檢查網址與 Firebase 讀寫權限規則。';
    } finally {
        icon.className = 'fas fa-vial';
        btn.classList.remove('pointer-events-none', 'opacity-60');
    }
}