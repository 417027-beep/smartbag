const CACHE_NAME = 'smartbag-v34'; // v34 書包狀態即時同步（SSE + 輪詢備援）
const CORE_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/config.js',
    './js/auth.js',
    './js/firebase-db.js',
    './js/telegram.js',
    './js/backpack.js',
    './js/teacher.js',
    './js/parent.js',
    './js/student.js',
    './js/schedule.js',
    './js/packing.js',
    './js/mqtt.js',
    './js/gps-map.js',
    './js/nightly.js',
    './js/realtime.js',
    './js/app.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    if (url.origin === location.origin) {
        if (event.request.mode === 'navigate') {
            event.respondWith(
                fetch(event.request)
                    .then((res) => {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
                        return res;
                    })
                    .catch(() => caches.match('./index.html'))
            );
            return;
        }

        event.respondWith(
            caches.match(event.request).then((cached) => {
                const fetched = fetch(event.request).then((res) => {
                    if (res && res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
                    }
                    return res;
                });
                return cached || fetched;
            })
        );
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
