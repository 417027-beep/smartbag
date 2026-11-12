let backpackEventSource = null;
let backpackEventWatchdog = null;
let backpackPollTimer = null;
let backpackPollInterval = 0;
let backpackRefreshTimer = null;
let backpackRealtimeRole = '';

function stopBackpackRealtime() {
    if (backpackEventSource) {
        backpackEventSource.close();
        backpackEventSource = null;
    }
    clearTimeout(backpackEventWatchdog);
    backpackEventWatchdog = null;
    clearTimeout(backpackRefreshTimer);
    backpackRefreshTimer = null;
    clearInterval(backpackPollTimer);
    backpackPollTimer = null;
    backpackPollInterval = 0;
    backpackRealtimeRole = '';
}

function scheduleBackpackRefresh() {
    if (!currentUser || !backpackRealtimeRole) return;
    clearTimeout(backpackRefreshTimer);
    backpackRefreshTimer = setTimeout(applyBackpackRefreshNow, 350);
}

async function applyBackpackRefreshNow() {
    if (!currentUser || !backpackRealtimeRole) return;
    if (backpackRealtimeRole === 'teacher') {
        if (typeof refreshTeacherBackpacks === 'function') {
            try { await refreshTeacherBackpacks(); } catch (e) { console.warn('即時更新書包儀表板失敗:', e); }
        }
        if (typeof selectedPackingStudent !== 'undefined' && selectedPackingStudent &&
            typeof applyPackingStudentView === 'function') {
            try { await applyPackingStudentView(); } catch (e) { console.warn('即時更新盤點清單失敗:', e); }
        }
    } else if (backpackRealtimeRole === 'parent') {
        if (typeof loadChildBackpack === 'function') {
            try { await loadChildBackpack(); } catch (e) { console.warn('即時更新小朋友書包失敗:', e); }
        }
    }
}

function setBackpackPolling(intervalMs) {
    if (backpackPollTimer && backpackPollInterval === intervalMs) return;
    clearInterval(backpackPollTimer);
    backpackPollInterval = intervalMs;
    backpackPollTimer = setInterval(() => {
        if (!document.hidden) applyBackpackRefreshNow();
    }, intervalMs);
}

function startBackpackRealtime(role) {
    stopBackpackRealtime();
    if (!currentUser) return;
    backpackRealtimeRole = role;

    if (typeof EventSource !== 'undefined') {
        const path = role === 'teacher'
            ? APP_CONFIG.backpackPath + '.json'
            : APP_CONFIG.backpackPath + '/' + currentUser.child + '.json';
        try {
            const es = new EventSource(getRtdbBase() + '/' + path);
            backpackEventSource = es;
            let gotEvent = false;
            const onEvent = () => {
                if (backpackEventSource !== es) return;
                gotEvent = true;
                clearTimeout(backpackEventWatchdog);
                backpackEventWatchdog = null;
                scheduleBackpackRefresh();
            };
            es.addEventListener('put', onEvent);
            es.addEventListener('patch', onEvent);
            es.onerror = () => {
                if (backpackEventSource !== es) return;
                if (es.readyState === EventSource.CLOSED) {
                    es.close();
                    backpackEventSource = null;
                    setBackpackPolling(3000);
                }
            };
            // 8 秒內完全沒收到事件就視為 SSE 不可用，改用輪詢
            backpackEventWatchdog = setTimeout(() => {
                if (backpackEventSource === es && !gotEvent) {
                    es.close();
                    backpackEventSource = null;
                    setBackpackPolling(3000);
                }
            }, 8000);
        } catch (e) {
            backpackEventSource = null;
        }
    }

    // SSE 正常時仍每 15 秒補一次；SSE 無法使用時改為每 3 秒輪詢
    setBackpackPolling(backpackEventSource ? 15000 : 3000);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleBackpackRefresh();
});
window.addEventListener('focus', scheduleBackpackRefresh);
