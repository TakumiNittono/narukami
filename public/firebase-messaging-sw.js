// FCM用Service Worker（firebase-messaging-sw.js という名前は必須）
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase設定
firebase.initializeApp({
    apiKey: "AIzaSyAA-bPkKybAiAqWcTPt2oDp8Gfo5L-9IIc",
    authDomain: "pwanarukami.firebaseapp.com",
    projectId: "pwanarukami",
    storageBucket: "pwanarukami.firebasestorage.app",
    messagingSenderId: "958557719636",
    appId: "1:958557719636:web:4b96583c5c62c3692971c1"
});

const messaging = firebase.messaging();

// バックグラウンド通知受信
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    const notificationTitle = payload.notification?.title || 'お知らせ';
    const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: {
            url: payload.fcmOptions?.link || payload.data?.url || '/'
        },
        requireInteraction: false,
        tag: 'narukami-notification'
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
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
