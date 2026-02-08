import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// 通知別パフォーマンス一覧を返すAPI
export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const limit = parseInt(req.query.limit) || 30;
        const offset = parseInt(req.query.offset) || 0;

        // 通知一覧を取得（送信済みのみ）
        const { data: notifications, error: notifError } = await supabaseAdmin
            .from('notifications')
            .select('id, title, body, url, send_at, created_at, target_user_count')
            .eq('sent', true)
            .is('deleted_at', null)
            .order('send_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (notifError) throw notifError;

        // 各通知の統計情報を取得
        const notificationIds = notifications.map(n => n.id);
        const { data: stats, error: statsError } = await supabaseAdmin
            .from('notification_stats')
            .select('*')
            .in('notification_id', notificationIds);

        if (statsError) throw statsError;

        // 統計情報をマップ
        const statsMap = {};
        if (stats) {
            stats.forEach(s => {
                statsMap[s.notification_id] = s;
            });
        }

        // 通知と統計を結合
        const result = notifications.map(notif => {
            const stat = statsMap[notif.id] || {
                total_sent: 0,
                total_opened: 0,
                total_clicked: 0,
                open_rate: 0,
                ctr: 0
            };

            return {
                id: notif.id,
                title: notif.title,
                body: notif.body,
                url: notif.url,
                send_at: notif.send_at,
                created_at: notif.created_at,
                target_user_count: notif.target_user_count || stat.total_sent,
                performance: {
                    total_sent: stat.total_sent,
                    total_opened: stat.total_opened,
                    total_clicked: stat.total_clicked,
                    open_rate: parseFloat(stat.open_rate || 0),
                    ctr: parseFloat(stat.ctr || 0)
                }
            };
        });

        return res.status(200).json({
            status: 'ok',
            data: result
        });
    } catch (err) {
        console.error('Analytics notifications error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
