// VAPID公開鍵（環境変数から設定、または直接記述）
// この値は公開しても問題ありません
const VAPID_PUBLIC_KEY = "BNLbxfSORptI6uefID7olqi38jJ6vnQMqxhvbczNu44nNy1mcP0SPDyCqTtmt3WiSIckAmqIAfFu3y51DH-iKcM";

// VAPIDキーをURL Safe Base64からUint8Arrayに変換
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
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

// Service Workerがアクティブになるまで待つ（初回読み込み時のPush購読エラーを防ぐ）
async function waitForServiceWorkerActive(registration) {
    if (registration.active && registration.active.state === 'activated') {
        return registration;
    }
    const sw = registration.installing || registration.waiting;
    if (sw) {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Service Workerの準備がタイムアウトしました。ページを再読み込みしてお試しください')), 15000);
            const onStateChange = () => {
                if (sw.state === 'activated') {
                    clearTimeout(timeout);
                    sw.removeEventListener('statechange', onStateChange);
                    resolve();
                } else if (sw.state === 'redundant') {
                    clearTimeout(timeout);
                    sw.removeEventListener('statechange', onStateChange);
                    reject(new Error('Service Workerの有効化に失敗しました'));
                }
            };
            sw.addEventListener('statechange', onStateChange);
            if (sw.state === 'activated') {
                clearTimeout(timeout);
                sw.removeEventListener('statechange', onStateChange);
                resolve();
            }
        });
    }
    return await navigator.serviceWorker.ready;
}

// Push通知のサブスクリプション取得
async function subscribeToPush(registration) {
    try {
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        
        console.log('Push Subscription:', subscription);
        return subscription;
    } catch (error) {
        console.error('Push Subscriptionエラー:', error);
        throw error;
    }
}

// サブスクリプションをJSON形式に変換
function subscriptionToJSON(subscription) {
    const keys = subscription.getKey ? {
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth'))
    } : null;
    
    return {
        endpoint: subscription.endpoint,
        keys: keys
    };
}

// ArrayBufferをBase64に変換
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
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

        // Push API対応チェック
        if (!('PushManager' in window)) {
            throw new Error('このブラウザはPush通知に対応していません');
        }

        button.disabled = true;
        button.querySelector('.btn-text').style.display = 'none';
        button.querySelector('.btn-loader').style.display = 'inline-flex';
        statusMessage.style.display = 'none';

        // Service Worker登録
        const registration = await registerServiceWorker();
        
        // Service Workerがアクティブになるまで待つ（初回でもPush購読できるようにする）
        await waitForServiceWorkerActive(registration);

        // 通知許可リクエスト
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            // Push Subscription取得
            const subscription = await subscribeToPush(registration);
            
            // サブスクリプション情報をJSONに変換
            const subscriptionData = subscriptionToJSON(subscription);

            console.log('Push Subscription Data:', subscriptionData);

            // サーバーにサブスクリプション送信（ドメイン情報も含める）
            const response = await fetch('/api/register-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    subscription: subscriptionData,
                    domain: window.location.hostname
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'サーバーエラーが発生しました' }));
                throw new Error(errorData.message || `サーバーエラー: ${response.status}`);
            }

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
        button.querySelector('.btn-text').style.display = 'inline-flex';
        button.querySelector('.btn-loader').style.display = 'none';
        
        // エラーメッセージをユーザーフレンドリーに表示
        let errorMsg = error.message || '通知の設定に失敗しました。もう一度お試しください。';
        
        // 特定のエラーメッセージを日本語に翻訳
        if (errorMsg.includes('active service worker') || errorMsg.includes('Service Worker')) {
            errorMsg = '通知の準備ができていません。2〜3秒待ってからもう一度お試しください。';
        } else if (errorMsg.includes('Invalid subscription')) {
            errorMsg = 'サブスクリプション情報が無効です。ページを再読み込みして再度お試しください。';
        } else if (errorMsg.includes('endpoint')) {
            errorMsg = '通知の設定に問題が発生しました。ブラウザを最新版に更新してください。';
        } else if (errorMsg.includes('サーバーエラー')) {
            errorMsg = 'サーバーに接続できませんでした。しばらくしてから再度お試しください。';
        }
        
        statusMessage.textContent = errorMsg;
        statusMessage.className = 'status-message error';
        statusMessage.style.display = 'block';
    }
}

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('enableNotifications');
    
    // 既に通知許可済みかチェック
    if (Notification.permission === 'granted') {
        button.querySelector('.btn-text').textContent = '登録済みです ✓';
        button.querySelector('.btn-loader').style.display = 'none';
        button.disabled = true;
    }

    // ページ読み込み時にService Workerを事前登録（クリック時には既にアクティブに）
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => 
            console.warn('SW事前登録:', err)
        );
    }

    button.addEventListener('click', requestNotificationPermission);
});
