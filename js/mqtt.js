let mqttClient = null;

let mqttReconnectTimer = null;
let mqttConnecting = false;
let scheduleSyncTimer = null;

let rfidDiagnosticTimer = null;
let mqttDiagnosticTimer = null;
let mqttDiagnosticToken = '';
let rfidDiagnosticCount = 0;

function diagnosticText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function startRfidDiagnostic() {
    clearTimeout(rfidDiagnosticTimer);
    rfidDiagnosticCount = 0;
    diagnosticText('rfid-test-details', '');
    if (!mqttClient || !mqttClient.isConnected()) {
        diagnosticText('rfid-test-result', '網頁尚未連上 MQTT，請先按上方的重新連線。');
        return;
    }
    diagnosticText('rfid-test-result', '等待刷卡：請在 15 秒內將卡片靠近讀卡器。');
    rfidDiagnosticTimer = setTimeout(() => {
        diagnosticText('rfid-test-result', '15 秒內未收到刷卡訊息。請確認 ESP32 的 Wi-Fi、學生 ID 與 RFID 主題；你仍可繼續刷卡。');
    }, 15000);
}

function recordRfidDiagnostic(text, retained) {
    if (!currentUser || currentUser.role !== 'student') return;
    if (retained) {
        diagnosticText('rfid-test-result', '收到伺服器保留的舊刷卡訊息，請再刷一次實體卡確認。');
        return;
    }
    clearTimeout(rfidDiagnosticTimer);
    rfidDiagnosticCount++;
    const uid = text.split(',')[0].trim().toUpperCase().replace(/[^0-9A-F]/g, '');
    const name = RFID_UID_MAP[uid];
    const key = name ? (MQTT_NAME_MAP[name] || name) : '';
    const result = name ? (itemsToPack.some(item => item.matchKey === key) ? '在目前攜帶清單內' : '不是目前需攜帶的物品') : '未辨識的卡號或非 UID 訊息';
    diagnosticText('rfid-test-result', '收到 RFID 訊息，網頁接收有反應！累計 ' + rfidDiagnosticCount + ' 次');
    diagnosticText('rfid-test-details', '時間：' + new Date().toLocaleTimeString('zh-TW') +
        '\n頻道：' + mqttStudentTopic(currentUser.id, 'RFID') + '\n原始訊息：' + text +
        '\n物品：' + (key || '未知') + '\n判斷：' + result);
}

function testMqttRoundTrip() {
    clearTimeout(mqttDiagnosticTimer);
    mqttDiagnosticToken = '';
    if (!currentUser || currentUser.role !== 'student' || !mqttClient || !mqttClient.isConnected()) {
        diagnosticText('mqtt-test-result', '無法測試：請先登入學生並連上 MQTT。');
        return;
    }
    mqttDiagnosticToken = 'test_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const msg = new Paho.MQTT.Message(mqttDiagnosticToken);
    msg.destinationName = mqttStudentTopic(currentUser.id, 'connection_test');
    msg.retain = false;
    diagnosticText('mqtt-test-result', '正在測試 MQTT 收發…');
    mqttDiagnosticTimer = setTimeout(() => {
        mqttDiagnosticToken = '';
        diagnosticText('mqtt-test-result', '收發測試逾時：未收到伺服器回傳，請重新連線後再試。');
    }, 8000);
    try { mqttClient.send(msg); } catch (error) {
        clearTimeout(mqttDiagnosticTimer);
        mqttDiagnosticToken = '';
        diagnosticText('mqtt-test-result', '測試發送失敗：' + error.message);
    }
}

function setMqttStatus(text) {
    const badge = document.getElementById('mqtt-status-badge');
    if (badge) badge.textContent = text;
    document.querySelectorAll('[data-mqtt-status]').forEach(el => { el.textContent = text; });
    const sid = mqttStudentId();
    document.querySelectorAll('[data-mqtt-topic]').forEach(el => {
        el.textContent = STUDENTS.includes(sid) ? '刷卡頻道：' + mqttStudentTopic(sid, 'RFID') : '老師監看學生頻道';
    });
}

function mqttStudentId() {
    if (!currentUser) return '';
    if (currentUser.role === 'student') return currentUser.id;
    if (currentUser.role === 'parent') return currentUser.child;
    return typeof selectedPackingStudent !== 'undefined' ? selectedPackingStudent : '';
}

function mqttStudentTopic(sid, suffix) {
    if (!STUDENTS.includes(sid)) throw new Error('未指定有效的學生 MQTT 頻道');
    return APP_CONFIG.mqtt.baseTopic + '/' + sid + '/' + suffix;
}

function stopMQTT() {
    clearTimeout(rfidDiagnosticTimer);
    clearTimeout(mqttDiagnosticTimer);
    mqttDiagnosticToken = '';
    rfidDiagnosticCount = 0;
    diagnosticText('rfid-test-result', '尚未開始測試');
    diagnosticText('rfid-test-details', '');
    diagnosticText('mqtt-test-result', 'MQTT 收發測試尚未開始');
    clearTimeout(mqttReconnectTimer);
    mqttReconnectTimer = null;
    clearInterval(scheduleSyncTimer);
    scheduleSyncTimer = null;
    const client = mqttClient;
    mqttClient = null;
    mqttConnecting = false;
    lastSchedulePayload = null;
    lastPackedComplete = null;
    setMqttStatus('MQTT 已中斷');
    document.querySelectorAll('[data-mqtt-last]').forEach(el => { el.textContent = '尚未收到刷卡訊息'; });
    if (client) {
        client.onConnectionLost = () => {};
        client.onMessageArrived = () => {};
        try { client.disconnect(); } catch (e) { /* 尚未連線 */ }
    }
}

function initMQTT() {
    if (!currentUser || mqttConnecting || (mqttClient && mqttClient.isConnected())) return;
    if (typeof Paho === 'undefined' || !Paho.MQTT) {
        setMqttStatus('MQTT 函式庫未載入，請檢查網路後重新整理');
        return;
    }
    if (location.protocol === 'https:' && !APP_CONFIG.mqtt.useSSL) {
        setMqttStatus('MQTT 無法連線：HTTPS 網頁需要設定安全連線 WSS');
        return;
    }
    setMqttStatus('MQTT 連線中…');
    clearTimeout(mqttReconnectTimer);
    const client = new Paho.MQTT.Client(APP_CONFIG.mqtt.host, APP_CONFIG.mqtt.port,
        APP_CONFIG.mqtt.path, 'client_' + Math.random().toString(36).substring(2, 10));
    mqttClient = client;
    mqttConnecting = true;
    const retry = (error) => {
        if (mqttClient !== client) return;
        mqttConnecting = false;
        setMqttStatus('MQTT 連線失敗，5 秒後重試：' + (error && error.errorMessage || '連線中斷')); 
        clearTimeout(mqttReconnectTimer);
        mqttReconnectTimer = setTimeout(initMQTT, 5000);
    };
    client.onConnectionLost = retry;
    client.onMessageArrived = msg => { if (mqttClient === client) onMqttMessage(msg); };
    try { client.connect({
        useSSL: APP_CONFIG.mqtt.useSSL,
        onSuccess: () => {
            if (mqttClient !== client || !currentUser) {
                try { client.disconnect(); } catch (e) {}
                return;
            }
            mqttConnecting = false;
            setMqttStatus('MQTT 已連線，正在訂閱學生頻道…');
            const ids = currentUser.role === 'teacher' ? STUDENTS : [mqttStudentId()];
            ids.filter(sid => STUDENTS.includes(sid)).forEach(sid => {
                client.subscribe(mqttStudentTopic(sid, '#'), {
                    onSuccess: () => { if (mqttClient === client) setMqttStatus('MQTT 已連線，已訂閱學生頻道'); },
                    onFailure: err => { if (mqttClient === client) setMqttStatus('MQTT 訂閱失敗：' + (err.errorMessage || sid)); }
                });
            });
            publishScheduleToEsp(true);
            publishPackedItemsToEsp();
            publishPackedCompleteToEsp(true);
            publishLedAnimMode();
            if (currentUser.role === 'student') {
                clearInterval(scheduleSyncTimer);
                scheduleSyncTimer = setInterval(() => {
                    if (mqttClient === client && client.isConnected()) {
                        publishScheduleToEsp(true);
                        publishPackedItemsToEsp();
                        publishPackedCompleteToEsp(true);
                        publishLedAnimMode();
                    }
                }, 30000);
            }
        },
        onFailure: retry
    }); } catch (error) { retry({errorMessage: error.message}); }
}

function onMqttMessage(msg) {
    if (!currentUser) return;
    const prefix = APP_CONFIG.mqtt.baseTopic + '/';
    const topic = msg.destinationName || '';
    if (!topic.startsWith(prefix)) return;
    const parts = topic.slice(prefix.length).split('/');
    if (parts.length !== 2) return;
    const [sid, kind] = parts;
    if (!STUDENTS.includes(sid)) return;
    if (currentUser.role !== 'teacher' && sid !== mqttStudentId()) return;
    const text = (msg.payloadString || '').trim();
    if (kind === 'connection_test') {
        if (!msg.retained && mqttDiagnosticToken && text === mqttDiagnosticToken) {
            clearTimeout(mqttDiagnosticTimer);
            mqttDiagnosticToken = '';
            diagnosticText('mqtt-test-result', 'MQTT 收發成功！網頁已送出並收到測試訊息；接著請測試實體刷卡。');
        }
        return;
    }
    // 老師只更新指定學生的檢視；不同學生不共用本地打勾清單。
    if (currentUser.role === 'teacher') {
        if (kind === 'RFID' && typeof refreshTeacherBackpacks === 'function') refreshTeacherBackpacks();
        if (sid !== mqttStudentId()) return;
    }
    if (kind === 'GPS') {
        const values = text.split(',').map(Number);
        if (values.length === 2 && text.split(',').every(v => v.trim()) &&
            values.every(Number.isFinite) && Math.abs(values[0]) <= 90 && Math.abs(values[1]) <= 180 &&
            typeof updateGps === 'function') updateGps(values[0], values[1]);
        return;
    }
    if (kind !== 'RFID') return;
    recordRfidDiagnostic(text, msg.retained);
    if (msg.retained) return;
    document.querySelectorAll('[data-mqtt-last]').forEach(el => {
        el.textContent = '收到刷卡 ' + new Date().toLocaleTimeString('zh-TW') + '：' + text;
    });
    // 家長及老師的書包狀態由 Firebase 讀取，不寫入其他學生的紀錄。
    if (currentUser.role === 'parent') { loadChildBackpack(); return; }
    if (currentUser.role === 'teacher') {
        if (typeof applyPackingStudentView === 'function') applyPackingStudentView();
        return;
    }
    const colon = text.lastIndexOf(':');
    if (colon > 0) {
        const value = text.slice(colon + 1).trim().toLowerCase();
        if (value === 'yes' || value === 'no') applyScannedItem(text.slice(0, colon).trim(), value === 'yes');
    } else {
        handleRfidUid(text);
    }
}

// 目前韌體：payload 為無冒號 UID（已知卡可能帶 ",物品名稱"），轉成科目名稱後打勾
function handleRfidUid(rawUid) {
    // 頁面若跨日仍開著，先用「今天」重建清單，避免拿昨天的清單判斷
    if (typeof ensurePackingForToday === 'function') ensurePackingForToday();
    const uid = String(rawUid || '').split(',')[0].toUpperCase().replace(/[^0-9A-F]/g, '');
    if (!uid) return;
    const name = RFID_UID_MAP[uid];
    if (!name) {
        console.log('MQTT 收到未登記 UID:', uid);
        showToast('⚠️ 感應到未登記卡片：' + uid, 'warn');
        publishRfidFeedback(uid, false);
        return;
    }
    const key = MQTT_NAME_MAP[name] || name;
    const needed = itemsToPack.some(item => item.matchKey === key);
    applyScannedItem(name, true);
    publishRfidFeedback(uid, needed);
}

// 回傳當次刷卡的網頁判斷；事件不可保留，避免重連重播舊結果。
function publishRfidFeedback(uid, accepted) {
    if (!currentUser || currentUser.role !== 'student' || !mqttClient || !mqttClient.isConnected()) return;
    const msg = new Paho.MQTT.Message(uid + ',' + (accepted ? 'yes' : 'no'));
    msg.destinationName = mqttStudentTopic(currentUser.id, 'RFID_feedback');
    msg.qos = 1;
    msg.retain = false;
    mqttClient.send(msg);
}

function applyScannedItem(rawKey, scanned) {
    const key = MQTT_NAME_MAP[rawKey] || rawKey;

    let matchedNames = [];
    itemsToPack.forEach(item => {
        if (item.matchKey === key) {
            item.scanned = scanned;
            matchedNames.push(item.name);
        }
    });

    if (matchedNames.length === 0) {
        console.log('MQTT 收到未比對的訊息:', key, scanned);
        showToast('⚠️ 掃描到非當日物品：「' + key + '」，本日不需攜帶', 'warn');
        return;
    }

    renderPackingList();
    updateWeightAndLED();

    if (currentUser && currentUser.role === 'student' && myBackpackRecord) {
        touchBackpackRecord(myBackpackRecord);
        matchedNames.forEach(name => {
            myBackpackRecord.items[name] = scanned;
        });
        dbPut(APP_CONFIG.backpackPath + '/' + currentUser.id + '.json', myBackpackRecord)
            .catch(err => console.error('MQTT 同步 Firebase 失敗:', err));
        prepareStudentItems();
    }

    if (currentUser && currentUser.role === 'teacher' && typeof refreshTeacherBackpacks === 'function') {
        setTimeout(refreshTeacherBackpacks, 1200);
    }

    if (currentUser && currentUser.role === 'parent' && typeof loadChildBackpack === 'function') {
        setTimeout(loadChildBackpack, 1200);
    }

    // 老師正在檢視某位學生（唯讀）時，即時感應不覆蓋該學生畫面
    if (typeof selectedPackingStudent !== 'undefined' && selectedPackingStudent && typeof applyPackingStudentView === 'function') {
        applyPackingStudentView();
    }
}

function uidForSubject(subjectKey) {
    for (const uid in RFID_UID_MAP) {
        const enName = RFID_UID_MAP[uid];
        if ((MQTT_NAME_MAP[enName] || enName) === subjectKey) return uid;
    }
    return null;
}

let lastSchedulePayload = null;
let lastPackedComplete = null;

// 把指定星期的清單轉成英文名稱（跟韌體 knownItems 同一套），發布給 ESP32
function buildSchedulePayloadForDay(dayKey) {
    const reverse = {};
    for (const en in MQTT_NAME_MAP) reverse[MQTT_NAME_MAP[en]] = en;
    const items = (typeof buildPackingItemsForDay === 'function')
        ? buildPackingItemsForDay(dayKey)
        : itemsToPack;
    const keys = [...new Set(items.map(i => i.matchKey))];
    return keys.map(k => reverse[k]).filter(Boolean).join(',');
}

function scheduleDayKey() {
    if (typeof todayPackingDayKey === 'function') return todayPackingDayKey();
    if (typeof packingDayKey !== 'undefined' && packingDayKey) return packingDayKey;
    return '';
}

function buildSchedulePayload() {
    return buildSchedulePayloadForDay(scheduleDayKey());
}

function sendScheduleTopic(sid, payload) {
    const msg = new Paho.MQTT.Message(payload);
    msg.destinationName = mqttStudentTopic(sid, 'schedule');
    msg.retain = true; // 狀態類訊息：ESP32 重新連線時會立刻收到最新清單
    mqttClient.send(msg);
}

function publishScheduleToEsp(force) {
    if (!mqttClient || !mqttClient.isConnected() || !currentUser) return;

    // 老師頁代表全班發布「今天」的清單，ESP32 才有正確清單可自行判斷 LED
    if (currentUser.role === 'teacher') {
        if (typeof todayPackingDayKey === 'function' && scheduleDayKey() !== todayPackingDayKey()) {
            console.log('老師目前檢視非今天，略過發布全班清單');
            return;
        }
        const payload = buildSchedulePayloadForDay(scheduleDayKey());
        const signature = 'all:' + payload;
        if (!force && signature === lastSchedulePayload) return;
        STUDENTS.forEach(sid => sendScheduleTopic(sid, payload));
        lastSchedulePayload = signature;
        console.log('已發布全班今日清單:', payload || '(空)');
        return;
    }

    if (currentUser.role !== 'student') return;
    const sid = mqttStudentId();
    if (!STUDENTS.includes(sid)) return;
    const payload = buildSchedulePayloadForDay(scheduleDayKey());
    const signature = sid + ':' + payload;
    if (!force && signature === lastSchedulePayload) return;
    sendScheduleTopic(sid, payload);
    lastSchedulePayload = signature;
    console.log('已發布今日清單:', payload || '(空)');
}

function publishPackedItemsToEsp() {
    if (!mqttClient || !mqttClient.isConnected() || !currentUser) return;
    if (currentUser.role !== 'student') return;
    const sid = mqttStudentId();
    if (!STUDENTS.includes(sid)) return;
    if (typeof itemsToPack === 'undefined' || !Array.isArray(itemsToPack)) return;
    const reverse = {};
    for (const en in MQTT_NAME_MAP) reverse[MQTT_NAME_MAP[en]] = en;
    const keys = [];
    itemsToPack.forEach(item => {
        if (!item.scanned) return;
        const key = reverse[item.matchKey] || item.matchKey;
        if (key && !keys.includes(key)) keys.push(key);
    });
    const msg = new Paho.MQTT.Message(keys.join(','));
    msg.destinationName = mqttStudentTopic(sid, 'packed_items');
    msg.qos = 1;
    msg.retain = true;
    mqttClient.send(msg);
}

function publishPackedCompleteToEsp(force) {
    if (!mqttClient || !mqttClient.isConnected() || !currentUser) return;
    if (currentUser.role !== 'student') return;
    const sid = mqttStudentId();
    if (!STUDENTS.includes(sid)) return;
    if (typeof itemsToPack === 'undefined' || !Array.isArray(itemsToPack)) return;
    const complete = itemsToPack.length > 0 && itemsToPack.every(item => item.scanned) ? '1' : '0';
    const signature = sid + ':' + complete;
    if (!force && signature === lastPackedComplete) return;
    const msg = new Paho.MQTT.Message(complete);
    msg.destinationName = mqttStudentTopic(sid, 'packed_complete');
    msg.qos = 1;
    msg.retain = true;
    mqttClient.send(msg);
    lastPackedComplete = signature;
    console.log('已發布書包完成狀態:', complete);
}

function publishLedAnimMode() {
    if (!mqttClient || !mqttClient.isConnected() || !currentUser) return;
    if (currentUser.role !== 'student') return;
    const sid = mqttStudentId();
    if (!STUDENTS.includes(sid)) return;
    const mode = localStorage.getItem('led_anim_mode_' + sid) || 'chick';
    const msg = new Paho.MQTT.Message(mode);
    msg.destinationName = mqttStudentTopic(sid, 'led_anim_mode');
    msg.qos = 1;
    msg.retain = true;
    mqttClient.send(msg);
}

function publishTestMqtt(status) {
    const sid = mqttStudentId();
    if (!STUDENTS.includes(sid)) { showToast('請先選擇學生 MQTT 頻道', 'warn'); return; }
    const subject = document.getElementById('mqtt-test-subject').value;
    if (!subject || !['yes', 'no'].includes(status)) return;
    if (!mqttClient || !mqttClient.isConnected()) { showToast('MQTT 尚未連線', 'warn'); return; }
    const uid = status === 'yes' ? uidForSubject(subject) : null;
    const msg = new Paho.MQTT.Message(uid || (subject + ':' + status));
    msg.destinationName = mqttStudentTopic(sid, 'RFID');
    mqttClient.send(msg);
}
