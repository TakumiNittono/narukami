// PWA用Service Worker
const CACHE_NAME = 'admin-v6';
const CACHE_URLS = [
    '/',
    '/thanks.html',
    '/styles/style.css',
    '/js/app.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/manifest.json'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // 各URLを個別に追加してエラーを回避
                return Promise.allSettled(
                    CACHE_URLS.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`Failed to cache ${url}:`, err);
                            return null;
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] Cache installed successfully');
            })
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
        url: '/',
        notification_id: null,
        notification_type: 'scheduled',
        user_id: null
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                url: data.url || data.link || notificationData.url,
                notification_id: data.notification_id || null,
                notification_type: data.notification_type || 'scheduled',
                user_id: data.user_id || null
            };
        } catch (e) {
            console.error('[SW] Pushデータのパースエラー:', e);
        }
    }
    
    event.waitUntil(
        Promise.all([
            // 通知を表示（タイトルを上に、fromを本文に）
            self.registration.showNotification(notificationData.title, {
                body: 'from 運営事務局\n' + notificationData.body,
                icon: notificationData.icon,
                badge: notificationData.badge,
                data: {
                    url: notificationData.url,
                    notification_id: notificationData.notification_id,
                    notification_type: notificationData.notification_type,
                    user_id: notificationData.user_id
                },
                requireInteraction: false,
                tag: 'notif-' + (notificationData.notification_id || Date.now())
            }),
            // 開封イベントをトラッキング
            notificationData.notification_id ? trackEvent('open', {
                notification_id: notificationData.notification_id,
                notification_type: notificationData.notification_type,
                user_id: notificationData.user_id
            }) : Promise.resolve()
        ])
    );
});

// 通知タップ処理
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    event.notification.close();
    
    const notificationData = event.notification.data || {};
    const targetUrl = notificationData.url || '/';
    const notificationId = notificationData.notification_id;
    const notificationType = notificationData.notification_type || 'scheduled';
    const userId = notificationData.user_id;
    
    // クリックイベントをトラッキング
    const trackPromise = notificationId ? trackEvent('click', {
        notification_id: notificationId,
        notification_type: notificationType,
        user_id: userId,
        url: targetUrl
    }) : Promise.resolve();
    
    event.waitUntil(
        Promise.all([
            trackPromise,
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clientList) => {
                    // 外部URLの場合は直接新しいウィンドウで開く
                    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
                        if (clients.openWindow) {
                            return clients.openWindow(targetUrl);
                        }
                        return;
                    }
                    // 内部URLの場合、既存のウィンドウがあればフォーカス
                    for (const client of clientList) {
                        if (client.url.includes(targetUrl) && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    // なければ新しいウィンドウを開く
                    if (clients.openWindow) {
                        return clients.openWindow(targetUrl);
                    }
                })
        ])
    );
});

// トラッキングイベントを送信するヘルパー関数
async function trackEvent(eventType, data) {
    try {
        console.log(`[SW] Tracking ${eventType} event:`, data);
        
        const response = await fetch('/api/track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...data,
                event_type: eventType
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`[SW] Track ${eventType} failed:`, response.status, errorText);
        } else {
            const result = await response.json();
            console.log(`[SW] Track ${eventType} success:`, result);
        }
    } catch (err) {
        console.error(`[SW] Track ${eventType} error:`, err);
    }
}
