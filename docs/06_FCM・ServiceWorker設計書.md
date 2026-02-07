# 06. FCM・Service Worker設計書

## 概要

Firebase Cloud Messaging (FCM) を使用して Web Push 通知を実現する。
Service Worker がバックグラウンドで通知を受信・表示し、タップ時に指定URLを開く。

---

## 全体フロー

```
[ユーザーがPWAを開く]
        │
        ▼
[Service Worker 登録]
        │
        ▼
[FCM トークン取得（VAPID Key使用）]
        │
        ▼
[POST /api/register-token でトークン送信]
        │
        ▼
[Vercel Serverless → Supabase に保存]

--- 時間経過 ---

[Vercel Cron / 管理者がテスト送信]
        │
        ▼
[Serverless Function → firebase-admin で FCM 送信]
        │
        ▼
[FCMがデバイスにPush]
        │
        ▼
[Service Worker が受信]
        │
        ▼
[通知を表示（タイトル・本文・アイコン）]
        │
        ▼
[ユーザーがタップ]
        │
        ▼
[指定URLを開く]
```

---

## Firebase設定（フロントエンド）

### js/app.js の構成

```javascript
// Firebase SDK (CDN)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-messaging.js';

// Firebase設定（公開OK）
const firebaseConfig = {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
```

### トークン取得処理

```javascript
async function requestNotificationPermission() {
    try {
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            // FCMトークン取得
            const token = await getToken(messaging, {
                vapidKey: 'YOUR_VAPID_KEY',
                serviceWorkerRegistration: await navigator.serviceWorker.getRegistration()
            });

            // Vercel APIにトークン送信
            await fetch('/api/register-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            // 完了画面へ
            window.location.href = '/thanks';
        } else {
            alert('通知を受け取るには許可が必要です');
        }
    } catch (error) {
        console.error('通知の設定に失敗しました:', error);
        alert('通知の設定に失敗しました。もう一度お試しください。');
    }
}
```

---

## Service Worker設計

### ファイル構成

| ファイル | 配置場所 | 役割 |
|---|---|---|
| `sw.js` | `public/sw.js` | PWA用Service Worker（キャッシュ等） |
| `firebase-messaging-sw.js` | `public/firebase-messaging-sw.js` | FCMバックグラウンド通知受信用 |

> **注意**: FCMは `firebase-messaging-sw.js` という名前のService Workerを自動検索する。
> このファイル名は変更不可。`public/` に配置するとVercelがルートに配信する。

### firebase-messaging-sw.js

```javascript
// Firebase SDK（Service Worker用 - compat版）
importScripts('https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.x.x/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
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
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url === targetUrl && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            })
    );
});
```

### sw.js（PWA用）

```javascript
const CACHE_NAME = 'narukami-v1';
const CACHE_URLS = [
    '/',
    '/thanks',
    '/styles/style.css',
    '/js/app.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CACHE_URLS))
    );
    self.skipWaiting();
});

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

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});
```

---

## manifest.json

```json
{
    "name": "Narukami",
    "short_name": "Narukami",
    "description": "プッシュ通知でお知らせを受け取れます",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#4A90D9",
    "orientation": "portrait",
    "icons": [
        {
            "src": "/icons/icon-192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any maskable"
        },
        {
            "src": "/icons/icon-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any maskable"
        }
    ]
}
```

---

## iOS PWA固有の対応

### iOS 16.4以降の制約

| 項目 | 制約 |
|---|---|
| Push通知 | PWAモード（ホーム画面追加）でのみ有効 |
| Service Worker | PWAモードでのみ動作 |
| Safariブラウザ単体 | Push通知 **不可** |
| バッジ | 非対応（赤バッジは出せない） |
| 通知許可 | ユーザーアクション（タップ）をトリガーにする必要あり |

### 対応方針

```javascript
function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

if (isIOS() && !isPWA()) {
    showInstallInstructions();  // 「ホーム画面に追加」説明表示
} else {
    showNotificationButton();   // 通知許可ボタン表示
}
```

### meta タグ（iOS対応）

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Narukami">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

---

## FCM送信ペイロード（サーバーサイド）

### firebase-admin SDK で送信

```javascript
// Vercel Serverless Function内
import { getFirebaseAdmin } from '../lib/firebase-admin.js';

const admin = getFirebaseAdmin();

// 複数デバイスに一斉送信（sendEachForMulticast）
const message = {
    notification: {
        title: '通知タイトル',
        body: '通知本文',
    },
    webpush: {
        notification: {
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            requireInteraction: false,
        },
        fcmOptions: {
            link: 'https://example.com/target',
        },
    },
    tokens: ['token1', 'token2', ...],
};

const response = await admin.messaging().sendEachForMulticast(message);
console.log(`成功: ${response.successCount}, 失敗: ${response.failureCount}`);
```

---

## トークン管理

### MVPでの対応範囲

- ✅ トークン登録（UPSERT）
- ✅ 重複防止（UNIQUE制約）
- ❌ 無効トークン削除（Phase2）
- ❌ トークンリフレッシュ検知（Phase2）

---

## テスト確認項目

| # | テスト項目 | 確認方法 |
|---|---|---|
| 1 | Service Worker登録 | DevTools → Application → Service Workers |
| 2 | FCMトークン取得 | console.logで確認 |
| 3 | トークンDB保存 | Supabaseダッシュボードで確認 |
| 4 | バックグラウンド通知表示 | アプリを閉じた状態で送信 |
| 5 | 通知タップ→URL遷移 | 実機で確認 |
| 6 | iOS PWAモード動作 | iPhoneでホーム画面追加後に確認 |
| 7 | Android Chrome動作 | Androidで確認 |
