import { supabaseAdmin } from '../lib/supabase.js';
import { initWebPush } from '../lib/webpush.js';
import { verifyAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { title, body, url } = req.body;

    if (!title || !body) {
        return res.status(400).json({ status: 'error', message: 'title and body are required' });
    }

    try {
        // Web Push初期化
        const webpush = initWebPush();

        // 全ユーザーのサブスクリプション取得
        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('fcm_token'); // 実際はsubscription JSON

        if (error) throw error;

        if (!users || users.length === 0) {
            return res.status(200).json({ status: 'ok', sent_count: 0, message: 'No users' });
        }

        let successCount = 0;
        let failureCount = 0;

        // 各ユーザーに通知送信
        const sendPromises = users.map(async (user) => {
            try {
                // fcm_tokenカラムに保存されたサブスクリプションJSONをパース
                const subscription = JSON.parse(user.fcm_token);
                
                const payload = JSON.stringify({
                    title: title,
                    body: body,
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                    url: url || '/'
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

        return res.status(200).json({
            status: 'ok',
            sent_count: successCount,
            error_count: failureCount,
        });
    } catch (err) {
        console.error('Send error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
