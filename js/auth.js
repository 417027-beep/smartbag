let currentUser = null;

function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const user = USERS[username];

    if (!username || !password || !user || password !== username) {
        errorEl.textContent = '帳號或密碼錯誤！';
        return;
    }

    currentUser = { id: username, ...user };
    const remember = document.getElementById('remember-login')?.checked;
    if (remember) localStorage.setItem('smartbag_user', username);
    else localStorage.removeItem('smartbag_user');
    errorEl.textContent = '';
    enterApp();
}

function enterApp() {
    if (!currentUser) return;

    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));

    if (currentUser.role === 'teacher') {
        document.getElementById('view-teacher').classList.remove('hidden');
        document.getElementById('teacher-user-label').textContent =
            currentUser.name + '（' + currentUser.id + '）';
        initTeacherView();
    } else if (currentUser.role === 'parent') {
        document.getElementById('view-parent').classList.remove('hidden');
        document.getElementById('parent-user-label').textContent =
            currentUser.name + '（' + currentUser.id + '）';
        initParentView();
    } else {
        document.getElementById('view-student').classList.remove('hidden');
        document.getElementById('student-user-label').textContent =
            currentUser.name + '（' + currentUser.id + '）';
        initStudentView();
    }

    // 地圖在隱藏時初始化會量不到大小，顯示後重新計算
    if (typeof gpsMapResize === 'function') gpsMapResize();
}

function restoreSession() {
    const saved = localStorage.getItem('smartbag_user');
    if (saved && USERS[saved]) {
        // 只有勾過「記住登入」才會還原
        currentUser = { id: saved, ...USERS[saved] };
        const cb = document.getElementById('remember-login');
        if (cb) cb.checked = true;
        enterApp();
    }
}
function clearSavedLogin() {
    localStorage.removeItem('smartbag_user');
    const cb = document.getElementById('remember-login');
    if (cb) cb.checked = false;
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    alert('已清除自動登入，下次需手動登入');
}

function doLogout() {
    if (typeof stopMQTT === 'function') stopMQTT();
    selectedPackingStudent = '';
    packingLiveBackup = null;
    itemsToPack = [];
    currentUser = null;
    localStorage.removeItem('smartbag_user');
    document.getElementById('login-error').textContent = '';
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-login').classList.remove('hidden');
}