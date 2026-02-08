import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// ダッシュボード用KPIサマリを返すAPI
export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 7);
        const lastWeekStart = new Date(weekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // 1. 総ユーザー数
        const { count: totalUsers, error: usersError } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true });

        if (usersError) throw usersError;

        // 2. 今日の新規登録
        const { count: newUsersToday, error: todayError } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString());

        if (todayError) throw todayError;

        // 3. 今週の新規登録
        const { count: newUsersThisWeek, error: weekError } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', weekStart.toISOString());

        if (weekError) throw weekError;

        // 4. 先週の新規登録（比較用）
        const { count: newUsersLastWeek, error: lastWeekError } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', lastWeekStart.toISOString())
            .lt('created_at', weekStart.toISOString());

        if (lastWeekError) throw lastWeekError;

        // 5. アクティブ購読者数（有効なトークンを持つユーザー数）
        // 現時点では全ユーザー数と同じ（無効トークンの削除は送信時に実行）
        const activeSubscribers = totalUsers || 0;

        // 6. 総通知送信数
        const { count: totalNotificationsSent, error: notifError } = await supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('sent', true)
            .is('deleted_at', null);

        if (notifError) throw notifError;

        // 7. 平均開封率・平均CTR（notification_statsから集計）
        const { data: stats, error: statsError } = await supabaseAdmin
            .from('notification_stats')
            .select('open_rate, ctr, total_sent')
            .gt('total_sent', 0);

        if (statsError) throw statsError;

        let avgOpenRate = 0;
        let avgCtr = 0;
        let totalSentForAvg = 0;

        if (stats && stats.length > 0) {
            // 重み付き平均を計算
            let totalOpened = 0;
            let totalClicked = 0;
            totalSentForAvg = stats.reduce((sum, s) => sum + s.total_sent, 0);

            stats.forEach(s => {
                totalOpened += (s.open_rate / 100) * s.total_sent;
                totalClicked += (s.ctr / 100) * s.total_sent;
            });

            avgOpenRate = totalSentForAvg > 0 ? (totalOpened / totalSentForAvg * 100) : 0;
            avgCtr = totalSentForAvg > 0 ? (totalClicked / totalSentForAvg * 100) : 0;
        }

        // 8. 先週の平均開封率・CTR（比較用）
        const { data: lastWeekStats, error: lastWeekStatsError } = await supabaseAdmin
            .from('notification_stats')
            .select('open_rate, ctr, total_sent, updated_at')
            .gt('total_sent', 0)
            .gte('updated_at', lastWeekStart.toISOString())
            .lt('updated_at', weekStart.toISOString());

        let lastWeekAvgOpenRate = 0;
        let lastWeekAvgCtr = 0;

        if (!lastWeekStatsError && lastWeekStats && lastWeekStats.length > 0) {
            let lastWeekTotalSent = lastWeekStats.reduce((sum, s) => sum + s.total_sent, 0);
            let lastWeekTotalOpened = 0;
            let lastWeekTotalClicked = 0;

            lastWeekStats.forEach(s => {
                lastWeekTotalOpened += (s.open_rate / 100) * s.total_sent;
                lastWeekTotalClicked += (s.ctr / 100) * s.total_sent;
            });

            lastWeekAvgOpenRate = lastWeekTotalSent > 0 ? (lastWeekTotalOpened / lastWeekTotalSent * 100) : 0;
            lastWeekAvgCtr = lastWeekTotalSent > 0 ? (lastWeekTotalClicked / lastWeekTotalSent * 100) : 0;
        }

        // 9. 直近の解除率（過去30日間の無効化トークン数 / 総ユーザー数）
        // 現時点では簡易実装（実際の無効化ログがないため0%を返す）
        const churnRate30d = 0;

        // トレンド計算
        const newUsersChangePct = newUsersLastWeek > 0
            ? ((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek * 100).toFixed(1)
            : newUsersThisWeek > 0 ? '100.0' : '0.0';

        const openRateChangePct = lastWeekAvgOpenRate > 0
            ? ((avgOpenRate - lastWeekAvgOpenRate) / lastWeekAvgOpenRate * 100).toFixed(1)
            : avgOpenRate > 0 ? '100.0' : '0.0';

        const ctrChangePct = lastWeekAvgCtr > 0
            ? ((avgCtr - lastWeekAvgCtr) / lastWeekAvgCtr * 100).toFixed(1)
            : avgCtr > 0 ? '100.0' : '0.0';

        // 総ユーザー数の前週比（簡易実装）
        const { count: usersLastWeek, error: usersLastWeekError } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', weekStart.toISOString());

        const usersChangePct = usersLastWeek > 0
            ? ((totalUsers - usersLastWeek) / usersLastWeek * 100).toFixed(1)
            : totalUsers > 0 ? '100.0' : '0.0';

        return res.status(200).json({
            status: 'ok',
            data: {
                total_users: totalUsers || 0,
                new_users_today: newUsersToday || 0,
                new_users_this_week: newUsersThisWeek || 0,
                active_subscribers: activeSubscribers,
                total_notifications_sent: totalNotificationsSent || 0,
                avg_open_rate: parseFloat(avgOpenRate.toFixed(2)),
                avg_ctr: parseFloat(avgCtr.toFixed(2)),
                churn_rate_30d: churnRate30d,
                trends: {
                    users_change_pct: parseFloat(usersChangePct),
                    new_users_change_pct: parseFloat(newUsersChangePct),
                    open_rate_change_pct: parseFloat(openRateChangePct),
                    ctr_change_pct: parseFloat(ctrChangePct)
                }
            }
        });
    } catch (err) {
        console.error('Analytics overview error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
