import { supabaseAdmin } from '../../lib/supabase.js';
import { initWebPush } from '../../lib/webpush.js';

export default async function handler(req, res) {
    // Vercel Cron認証
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        // Web Push初期化
        const webpush = initWebPush();

        // ===== STEP 1: 未送信通知を取得 =====
        const { data: notifications, error: notifError } = await supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('sent', false)
            .lte('send_at', new Date().toISOString())
            .order('send_at', { ascending: true });

        if (notifError) throw notifError;

        if (!notifications || notifications.length === 0) {
            return res.status(200).json({ status: 'ok', message: 'No pending notifications' });
        }

        // ===== STEP 2: 全ユーザートークン取得 =====
        const { data: users, error: userError } = await supabaseAdmin
            .from('users')
            .select('fcm_token'); // 実際はsubscription JSON

        if (userError) throw userError;

        if (!users || users.length === 0) {
            return res.status(200).json({ status: 'ok', message: 'No users to send' });
        }

        const results = [];

        // ===== STEP 3: 通知ごとに送信 =====
        for (const notification of notifications) {
            let successCount = 0;
            let failureCount = 0;

            // 各ユーザーに通知送信
            const sendPromises = users.map(async (user) => {
                try {
                    // fcm_tokenカラムに保存されたサブスクリプションJSONをパース
                    const subscription = JSON.parse(user.fcm_token);
                    
                    const payload = JSON.stringify({
                        title: notification.title,
                        body: notification.body,
                        icon: '/icons/icon-192.png',
                        badge: '/icons/icon-192.png',
                        url: notification.url || '/'
                    });

                    await webpush.sendNotification(subscription, payload);
                    successCount++;
                } catch (err) {
                    console.error('Send notification error:', err);
                    failureCount++;
                    
                    // 無効なサブスクリプションの場合は削除
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await supabaseAdmin
                            .from('users')
                            .delete()
                            .eq('fcm_token', user.fcm_token);
                    }
                }
            });

            await Promise.all(sendPromises);

            // ===== STEP 4: 送信済みに更新 =====
            await supabaseAdmin
                .from('notifications')
                .update({ sent: true })
                .eq('id', notification.id);

            results.push({
                id: notification.id,
                title: notification.title,
                success: successCount,
                failure: failureCount,
            });

            console.log(
                `[Cron] 通知ID:${notification.id} 送信完了 `
                + `成功:${successCount} 失敗:${failureCount}`
            );
        }

        return res.status(200).json({
            status: 'ok',
            message: `${notifications.length} notifications sent`,
            results,
        });
    } catch (err) {
        console.error('[Cron] Error:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
}
