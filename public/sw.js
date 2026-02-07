// PWA用Service Worker
const CACHE_NAME = 'narukami-v1';
const CACHE_URLS = [
    '/',
    '/thanks',
    '/styles/style.css',
    '/js/app.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CACHE_URLS))
            .catch((err) => console.error('キャッシュエラー:', err))
    );
    self.skipWaiting();
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// フェッチ時にキャッシュ優先
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});
