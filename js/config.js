const APP_CONFIG = {
    version: '1.1.3',
    nightlyBrowserReminder: false,
    // 注意：Token 寫在 config.js 等於公開（原始碼任何人可見），如需保密請改用網頁「設定」輸入
    // 「設定」輸入的 Token 存在 localStorage，會覆蓋此預設值；若外洩請到 @BotFather /revoke 後換新
    defaultRtdbBase: localStorage.getItem('rtdb_base') || 'https://project-4645226313484723906-default-rtdb.asia-southeast1.firebasedatabase.app',
    defaultTgToken: localStorage.getItem('tg_token') || '',
    schedulePath: 'schedule.json',
    teacherItemsPath: 'teacher-items.json',
    backpackPath: 'backpack',
    telegramChatsRoot: 'telegram/chats',
    mqtt: {
        host: 'mqttgo.io',
        port: 8084,
        path: '/mqtt',
        useSSL: true,
        // 每位學生使用 SmartBackpack7777/<學生ID>/<功能>，不再使用共用主題
        baseTopic: 'SmartBackpack7777',
        // 舊版 ESP32 主題（保留相容）
        legacyBaseTopic: 'smartbag6767'
    }
};

// ESP32 目前韌體感應卡片時發送的 UID（無冒號）對應表
// payload 格式：SmartBackpack7777/stua/RFID = "1EA0DD21"
const RFID_UID_MAP = {
    '1184A75D': 'Defense',
    '1EF0ED21': 'Math',
    '1EA0DD21': 'Chinese',
    '2E260721': 'English',
    '1EBFCD21': 'Physics',
    '0BFD0002': 'Health&Nursing',
    '1AFAB3B4': 'BaseElectric',
    'A7960202': 'InfoTech',
    '43790DAD': 'ElecIntern',
    '0A2D3207': 'Pencil case',
    'C3DF3107': 'PE',
    '62B3EE5C': 'Art',
    '133B8E29': 'english sentence pattern',
    '8364224D': 'taiwanese',
    '01F5AC5D': 'Geography',
    '73FE0317': 'Music',
    '54A2A605': 'Water bottle'
};

const USERS = {
    'tea':  { role: 'teacher', name: '老師' },
    'stua': { role: 'student', name: '小明', parentId: 'para' },
    'stub': { role: 'student', name: '小華', parentId: 'parb' },
    'stuc': { role: 'student', name: '小美', parentId: 'parc' },
    'stud': { role: 'student', name: '小傑', parentId: 'pard' },
    'stue': { role: 'student', name: '小安', parentId: 'pare' },
    'para': { role: 'parent', name: '小明家長', child: 'stua' },
    'parb': { role: 'parent', name: '小華家長', child: 'stub' },
    'parc': { role: 'parent', name: '小美家長', child: 'stuc' },
    'pard': { role: 'parent', name: '小傑家長', child: 'stud' },
    'pare': { role: 'parent', name: '小安家長', child: 'stue' }
};

const STUDENTS = ['stua', 'stub', 'stuc', 'stud', 'stue'];

const PARENT_IDS = ['para', 'parb', 'parc', 'pard', 'pare'];

// 每天必帶物品（不分課表，天天顯示在打包清單最上方）
const DAILY_ITEMS = ['水壺', '鉛筆盒'];

// 開啟即綁定：實際只有 2 台手機
//  手機 A（學生們共用，含小明）= 8263473085
//  手機 B（家長們共用）        = 6761233786
// 群發時同台手機去重→各收到 1 則訊息
const DEFAULT_CHATS = {
    'para': '6761233786',  // 手機 B
    'stua': '8263473085',  // 手機 A
    'tea':  '6761233786',  // 老師暫收於手機 B；取得 tea 真實 Id 後請替換
    'stub': '8263473085',  // 手機 A
    'stuc': '8263473085',
    'stud': '8263473085',
    'stue': '8263473085',
    'parb': '6761233786',  // 手機 B
    'parc': '6761233786',
    'pard': '6761233786',
    'pare': '6761233786'
};

const SUBJECT_CONFIG = {
    '物理': { icon: 'fa-atom', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', equip: [] },
    '資訊科技': { icon: 'fa-laptop-code', color: 'bg-slate-50 text-slate-700 border-slate-200', equip: [] },
    '國語文': { icon: 'fa-book', color: 'bg-red-50 text-red-700 border-red-200', equip: [] },
    '基本電學': { icon: 'fa-bolt', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', equip: [] },
    '地理': { icon: 'fa-globe-asia', color: 'bg-green-50 text-green-700 border-green-200', equip: [] },
    '英語文': { icon: 'fa-language', color: 'bg-blue-50 text-blue-700 border-blue-200', equip: [] },
    '基本電子實習': { icon: 'fa-microchip', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', equip: [] },
    '班會': { icon: 'fa-users', color: 'bg-gray-50 text-gray-500 border-gray-200', equip: [] },
    '社團課': { icon: 'fa-puzzle-piece', color: 'bg-purple-50 text-purple-700 border-purple-200', equip: [] },
    '數學': { icon: 'fa-square-root-alt', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', equip: [] },
    '健康與護理': { icon: 'fa-heartbeat', color: 'bg-rose-50 text-rose-700 border-rose-200', equip: [] },
    '全民國防': { icon: 'fa-shield-alt', color: 'bg-green-50 text-green-700 border-green-200', equip: [] },
    '音樂': { icon: 'fa-music', color: 'bg-purple-50 text-purple-700 border-purple-200', equip: [] },
    '美術': { icon: 'fa-palette', color: 'bg-pink-50 text-pink-700 border-pink-200', equip: [] },
    '閩南語文': { icon: 'fa-comment-dots', color: 'bg-teal-50 text-teal-700 border-teal-200', equip: [] },
    '體育': { icon: 'fa-basketball-ball', color: 'bg-orange-50 text-orange-700 border-orange-200', equip: [] },
    '英文句型': { icon: 'fa-spell-check', color: 'bg-blue-50 text-blue-700 border-blue-200', equip: [] }
};

const MQTT_NAME_MAP = {
    'Math': '數學', 'Chinese': '國語文', 'English': '英語文',
    'Physics': '物理', 'Chemistry': '化學', 'Biology': '生物',
    'History': '歷史', 'Geography': '地理', 'Civics': '公民',
    'PE': '體育', 'Music': '音樂', 'Art': '美術', 'EarthSci': '地科',
    'InfoTech': '資訊科技', 'Health&Nursing': '健康與護理',
    'Defense': '全民國防', 'BaseElectric': '基本電學',
    'ElecIntern': '基本電子實習', 'Pencil case': '鉛筆盒',
    'Water bottle': '水壺',
    'english sentence pattern': '英文句型', 'taiwanese': '閩南語文'
};

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}