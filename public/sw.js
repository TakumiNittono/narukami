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

// Push通知受信処理
self.addEventListener('push', (event) => {
    console.log('[SW] Push通知受信:', event);
    
    let notificationData = {
        title: 'お知らせ',
        body: '新しい通知があります',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        url: '/'
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                url: data.url || data.link || notificationData.url
            };
        } catch (e) {
            console.error('[SW] Pushデータのパースエラー:', e);
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            data: {
                url: notificationData.url
            },
            requireInteraction: false,
            tag: 'narukami-notification'
        })
    );
});

// 通知タップ処理
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    event.notification.close();
    
    const targetUrl = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // 既存のウィンドウがあればフォーカス
                for (const client of clientList) {
                    if (client.url === targetUrl && 'focus' in client) {
                        return client.focus();
                    }
                }
                // なければ新しいウィンドウを開く
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            })
    );
});
