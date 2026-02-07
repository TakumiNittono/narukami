// VAPIDキーペア生成スクリプト
import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('=== VAPID Keys ===');
console.log('Public Key (VAPID_PUBLIC_KEY):');
console.log(vapidKeys.publicKey);
console.log('\nPrivate Key (VAPID_PRIVATE_KEY):');
console.log(vapidKeys.privateKey);
console.log('\n=== 環境変数に設定してください ===');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
