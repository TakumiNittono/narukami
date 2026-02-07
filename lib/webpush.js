import webpush from 'web-push';

let initialized = false;

export function initWebPush() {
    if (!initialized) {
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            throw new Error('VAPID環境変数が設定されていません');
        }

        // VAPIDキーを設定
        webpush.setVapidDetails(
            'mailto:noreply@narukami.app', // 連絡先メールアドレス（必須）
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );

        initialized = true;
    }
    return webpush;
}
