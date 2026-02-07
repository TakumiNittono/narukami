import { supabaseAdmin } from '../../lib/supabase.js';
import { getFirebaseAdmin } from '../../lib/firebase-admin.js';

export default async function handler(req, res) {
    // Vercel Cron認証
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
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
            .select('fcm_token');

        if (userError) throw userError;

        if (!users || users.length === 0) {
            return res.status(200).json({ status: 'ok', message: 'No users to send' });
        }

        const tokens = users.map(u => u.fcm_token);
        const admin = getFirebaseAdmin();
        const results = [];

        // ===== STEP 3: 通知ごとに送信 =====
        for (const notification of notifications) {
            const message = {
                notification: {
                    title: notification.title,
                    body: notification.body,
                },
                webpush: {
                    notification: {
                        icon: '/icons/icon-192.png',
                        badge: '/icons/icon-192.png',
                        requireInteraction: false,
                    },
                    fcmOptions: {
                        link: notification.url || '/',
                    },
                },
                tokens,
            };

            const response = await admin.messaging().sendEachForMulticast(message);

            // ===== STEP 4: 送信済みに更新 =====
            await supabaseAdmin
                .from('notifications')
                .update({ sent: true })
                .eq('id', notification.id);

            results.push({
                id: notification.id,
                title: notification.title,
                success: response.successCount,
                failure: response.failureCount,
            });

            console.log(
                `[Cron] 通知ID:${notification.id} 送信完了 `
                + `成功:${response.successCount} 失敗:${response.failureCount}`
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
