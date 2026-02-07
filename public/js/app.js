// Firebase設定
const firebaseConfig = {
    apiKey: "AIzaSyAA-bPkKybAiAqWcTPt2oDp8Gfo5L-9IIc",
    authDomain: "pwanarukami.firebaseapp.com",
    projectId: "pwanarukami",
    storageBucket: "pwanarukami.firebasestorage.app",
    messagingSenderId: "958557719636",
    appId: "1:958557719636:web:4b96583c5c62c3692971c1"
};

// VAPID Key（Firebase Console → Cloud Messaging → Web Push証明書 → 鍵ペア から取得）
const VAPID_KEY = "BLJ2ifRuo7p8tWbe2QfzPylTggsWnT0gDvJxK15e6kOM86SOLw-Mx7gwSDX-i4yhRPdCkxhHYQrrrFUr8BOLTZI";

// Firebase SDK を動的にインポート
let messaging = null;

async function initFirebase() {
    try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
        
        const app = initializeApp(firebaseConfig);
        messaging = getMessaging(app);
        
        return { getToken };
    } catch (error) {
        console.error('Firebase初期化エラー:', error);
        throw error;
    }
}

// iOS判定
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// PWAモード判定
function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

// Service Worker登録
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker登録成功:', registration);
            return registration;
        } catch (error) {
            console.error('Service Worker登録失敗:', error);
            throw error;
        }
    } else {
        throw new Error('Service Worker非対応');
    }
}

// 通知許可リクエスト
async function requestNotificationPermission() {
    const button = document.getElementById('enableNotifications');
    const statusMessage = document.getElementById('statusMessage');
    
    try {
        // iOSかつPWA未インストールの場合
        if (isIOS() && !isPWA()) {
            document.getElementById('iosInstructions').style.display = 'block';
            statusMessage.textContent = 'ホーム画面に追加してから通知を許可してください';
            statusMessage.className = 'status-message error';
            statusMessage.style.display = 'block';
            return;
        }

        button.disabled = true;
        button.textContent = '設定中...';

        // Service Worker登録
        await registerServiceWorker();

        // Firebase初期化
        const { getToken } = await initFirebase();

        // 通知許可リクエスト
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            // FCMトークン取得
            const registration = await navigator.serviceWorker.ready;
            const token = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (!token) {
                throw new Error('トークン取得失敗');
            }

            console.log('FCMトークン:', token);

            // サーバーにトークン送信
            const response = await fetch('/api/register-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token }),
            });

            const result = await response.json();

            if (result.status === 'ok') {
                // 登録完了画面へ遷移
                window.location.href = '/thanks';
            } else {
                throw new Error(result.message || '登録に失敗しました');
            }
        } else {
            throw new Error('通知を受け取るには許可が必要です');
        }
    } catch (error) {
        console.error('通知設定エラー:', error);
        button.disabled = false;
        button.textContent = '通知を受け取る 🔔';
        statusMessage.textContent = error.message || '通知の設定に失敗しました。もう一度お試しください。';
        statusMessage.className = 'status-message error';
        statusMessage.style.display = 'block';
    }
}

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('enableNotifications');
    
    // 既に通知許可済みかチェック
    if (Notification.permission === 'granted') {
        button.textContent = '登録済みです ✓';
        button.disabled = true;
    }

    button.addEventListener('click', requestNotificationPermission);
});
