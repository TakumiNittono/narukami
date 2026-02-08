import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// 期間指定の推移データを返すAPI（グラフ用）
export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const period = req.query.period || '30d'; // 7d, 30d, 90d
    const metric = req.query.metric || 'users'; // users, notifications, open_rate, ctr

    try {
        const now = new Date();
        let startDate = new Date();

        // 期間に応じて開始日を設定
        switch (period) {
            case '7d':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(startDate.getDate() - 90);
                break;
            default:
                startDate.setDate(startDate.getDate() - 30);
        }

        let dataPoints = [];

        if (metric === 'users') {
            // ユーザー推移データ
            const { data: users, error } = await supabaseAdmin
                .from('users')
                .select('created_at')
                .gte('created_at', startDate.toISOString())
                .order('created_at', { ascending: true });

            if (error) throw error;

            // 日別に集計
            const dailyData = {};
            let cumulative = 0;

            // 開始日から今日までの日付を初期化
            const dateRange = [];
            for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                dateRange.push(dateStr);
                dailyData[dateStr] = { new: 0, total: 0 };
            }

            // 総ユーザー数を開始日の時点で取得
            const { count: initialUsers, error: initialError } = await supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .lt('created_at', startDate.toISOString());

            if (initialError) throw initialError;
            cumulative = initialUsers || 0;

            // 日別の新規登録数を集計
            if (users) {
                users.forEach(user => {
                    const dateStr = user.created_at.split('T')[0];
                    if (dailyData[dateStr]) {
                        dailyData[dateStr].new++;
                    }
                });
            }

            // 累計数を計算
            dateRange.forEach(dateStr => {
                cumulative += dailyData[dateStr].new;
                dataPoints.push({
                    date: dateStr,
                    value: cumulative,
                    new: dailyData[dateStr].new
                });
            });
        } else if (metric === 'notifications') {
            // 通知送信推移
            const { data: notifications, error } = await supabaseAdmin
                .from('notifications')
                .select('send_at, target_user_count')
                .eq('sent', true)
                .gte('send_at', startDate.toISOString())
                .order('send_at', { ascending: true });

            if (error) throw error;

            // 日別に集計
            const dailyData = {};
            const dateRange = [];
            for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                dateRange.push(dateStr);
                dailyData[dateStr] = { count: 0, sent: 0 };
            }

            if (notifications) {
                notifications.forEach(notif => {
                    const dateStr = notif.send_at.split('T')[0];
                    if (dailyData[dateStr]) {
                        dailyData[dateStr].count++;
                        dailyData[dateStr].sent += notif.target_user_count || 0;
                    }
                });
            }

            dateRange.forEach(dateStr => {
                dataPoints.push({
                    date: dateStr,
                    count: dailyData[dateStr].count,
                    sent: dailyData[dateStr].sent
                });
            });
        } else if (metric === 'open_rate' || metric === 'ctr') {
            // 開封率・CTR推移（通知ごと）
            const { data: stats, error } = await supabaseAdmin
                .from('notification_stats')
                .select('notification_id, open_rate, ctr, updated_at')
                .gte('updated_at', startDate.toISOString())
                .gt('total_sent', 0)
                .order('updated_at', { ascending: true });

            if (error) throw error;

            // 日別に平均を計算
            const dailyData = {};
            const dateRange = [];
            for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                dateRange.push(dateStr);
                dailyData[dateStr] = { values: [], count: 0 };
            }

            if (stats) {
                stats.forEach(stat => {
                    const dateStr = stat.updated_at.split('T')[0];
                    if (dailyData[dateStr]) {
                        const value = metric === 'open_rate' ? stat.open_rate : stat.ctr;
                        dailyData[dateStr].values.push(value);
                        dailyData[dateStr].count++;
                    }
                });
            }

            dateRange.forEach(dateStr => {
                const values = dailyData[dateStr].values;
                const avg = values.length > 0
                    ? values.reduce((sum, v) => sum + v, 0) / values.length
                    : 0;

                dataPoints.push({
                    date: dateStr,
                    value: parseFloat(avg.toFixed(2)),
                    count: dailyData[dateStr].count
                });
            });
        }

        return res.status(200).json({
            status: 'ok',
            data: {
                period,
                metric,
                data_points: dataPoints
            }
        });
    } catch (err) {
        console.error('Analytics trends error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
