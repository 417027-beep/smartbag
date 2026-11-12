let gpsMapObj = null;
let gpsMarker = null;
let gpsLast = null;

// 預設展示位置：國立虎尾科技大學（雲林縣虎尾鎮文化路64號）
const GPS_DEFAULT = { lat: 23.703108, lng: 120.430151 };

// 中文地圖：主圖用內政部國土測繪中心 EMAP（中文地名/路名），失敗自動換 CARTO Voyager
function addGpsTiles(map) {
    const primary = L.tileLayer('https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '內政部國土測繪中心'
    });
    const fallback = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    });
    let tileErrors = 0;
    primary.on('tileerror', () => {
        tileErrors++;
        if (tileErrors >= 3) {
            map.removeLayer(primary);
            fallback.addTo(map);
        }
    });
    primary.addTo(map);
}

function initGpsMap() {
    const el = document.getElementById('gps-map');
    if (!el || gpsMapObj) return;
    if (typeof L === 'undefined') {
        console.warn('Leaflet 未載入，地圖無法顯示');
        return;
    }
    const start = gpsLast || GPS_DEFAULT;
    gpsMapObj = L.map(el).setView([start.lat, start.lng], 17);
    addGpsTiles(gpsMapObj);
    gpsMarker = L.marker([start.lat, start.lng]).addTo(gpsMapObj);
    gpsMarker.bindPopup('國立虎尾科技大學（雲林）');
    updateGpsText(start.lat, start.lng, new Date());
    setTimeout(() => { if (gpsMapObj) gpsMapObj.invalidateSize(); }, 300);
}

function gpsMapResize() {
    initGpsMap();
    if (gpsMapObj) setTimeout(() => gpsMapObj.invalidateSize(), 300);
}

// 固定展示虎尾科大；MQTT 的裝置座標不影響展示位置。
function updateGps(lat, lng) {
    lat = GPS_DEFAULT.lat;
    lng = GPS_DEFAULT.lng;
    gpsLast = { lat: lat, lng: lng };
    if (!gpsMapObj) initGpsMap();
    if (gpsMapObj && gpsMarker) {
        gpsMarker.setLatLng([lat, lng]);
        gpsMapObj.panTo([lat, lng]);
    }
    updateGpsText(lat, lng, new Date());
}

function updateGpsText(lat, lng, time) {
    const c = document.getElementById('gps-coord-text');
    if (c) c.textContent = Number(lat).toFixed(6) + ', ' + Number(lng).toFixed(6);
    const t = document.getElementById('gps-update-time');
    if (t) t.textContent = time.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// 假的GPS心跳：每10秒刷新一次座標與時間顯示（ESP32沒連上時也能維持）
function startFakeGpsTicker() {
    setInterval(() => {
        const p = gpsLast || GPS_DEFAULT;
        updateGpsText(p.lat, p.lng, new Date());
    }, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
    initGpsMap();
    startFakeGpsTicker();
});
