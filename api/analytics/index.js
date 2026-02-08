import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// アナリティクスAPI統合版（?type=overview|notifications|trends）
export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const type = req.query.type || 'overview';

    try {
        if (type === 'overview') {
            return await handleOverview(req, res);
        } else if (type === 'notifications') {
            return await handleNotifications(req, res);
        } else if (type === 'trends') {
            return await handleTrends(req, res);
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid type parameter' });
        }
    } catch (err) {
        console.error('Analytics error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

// overview処理
async function handleOverview(req, res) {
    const tenantId = req.query.tenant_id; // フルマネージド対応

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    // 1. 総ユーザー数
    let usersQuery = supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true });
    
    if (tenantId) {
        usersQuery = usersQuery.eq('tenant_id', tenantId);
    }

    const { count: totalUsers, error: usersError } = await usersQuery;

    if (usersError) throw usersError;

    // 2. 今日の新規登録
    let newUsersTodayQuery = supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());
    if (tenantId) newUsersTodayQuery = newUsersTodayQuery.eq('tenant_id', tenantId);
    const { count: newUsersToday } = await newUsersTodayQuery;

    // 3. 今週の新規登録
    let newUsersThisWeekQuery = supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekStart.toISOString());
    if (tenantId) newUsersThisWeekQuery = newUsersThisWeekQuery.eq('tenant_id', tenantId);
    const { count: newUsersThisWeek } = await newUsersThisWeekQuery;

    // 4. 先週の新規登録（比較用）
    let newUsersLastWeekQuery = supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', lastWeekStart.toISOString())
        .lt('created_at', weekStart.toISOString());
    if (tenantId) newUsersLastWeekQuery = newUsersLastWeekQuery.eq('tenant_id', tenantId);
    const { count: newUsersLastWeek } = await newUsersLastWeekQuery;

    const activeSubscribers = totalUsers || 0;

    // 6. 総通知送信数
    let notificationsQuery = supabaseAdmin
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('sent', true)
        .is('deleted_at', null);
    if (tenantId) notificationsQuery = notificationsQuery.eq('tenant_id', tenantId);
    const { count: totalNotificationsSent } = await notificationsQuery;

    // 7. 平均開封率・平均CTR
    let statsQuery = supabaseAdmin
        .from('notification_stats')
        .select('open_rate, ctr, total_sent')
        .gt('total_sent', 0);
    if (tenantId) statsQuery = statsQuery.eq('tenant_id', tenantId);
    const { data: stats } = await statsQuery;

    let avgOpenRate = 0;
    let avgCtr = 0;
    let totalSentForAvg = 0;

    if (stats && stats.length > 0) {
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
    let lastWeekStatsQuery = supabaseAdmin
        .from('notification_stats')
        .select('open_rate, ctr, total_sent, updated_at')
        .gt('total_sent', 0)
        .gte('updated_at', lastWeekStart.toISOString())
        .lt('updated_at', weekStart.toISOString());
    if (tenantId) lastWeekStatsQuery = lastWeekStatsQuery.eq('tenant_id', tenantId);
    const { data: lastWeekStats } = await lastWeekStatsQuery;

    let lastWeekAvgOpenRate = 0;
    let lastWeekAvgCtr = 0;

    if (lastWeekStats && lastWeekStats.length > 0) {
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

    const churnRate30d = 0;

    const newUsersChangePct = newUsersLastWeek > 0
        ? ((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek * 100).toFixed(1)
        : newUsersThisWeek > 0 ? '100.0' : '0.0';

    const openRateChangePct = lastWeekAvgOpenRate > 0
        ? ((avgOpenRate - lastWeekAvgOpenRate) / lastWeekAvgOpenRate * 100).toFixed(1)
        : avgOpenRate > 0 ? '100.0' : '0.0';

    const ctrChangePct = lastWeekAvgCtr > 0
        ? ((avgCtr - lastWeekAvgCtr) / lastWeekAvgCtr * 100).toFixed(1)
        : avgCtr > 0 ? '100.0' : '0.0';

    let usersLastWeekQuery = supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', weekStart.toISOString());
    if (tenantId) usersLastWeekQuery = usersLastWeekQuery.eq('tenant_id', tenantId);
    const { count: usersLastWeek } = await usersLastWeekQuery;

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
}

// notifications処理
async function handleNotifications(req, res) {
    const tenantId = req.query.tenant_id; // フルマネージド対応
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;

    let notificationsQuery = supabaseAdmin
        .from('notifications')
        .select('id, title, body, url, send_at, created_at, target_user_count')
        .eq('sent', true)
        .is('deleted_at', null)
        .order('send_at', { ascending: false })
        .range(offset, offset + limit - 1);
    
    if (tenantId) {
        notificationsQuery = notificationsQuery.eq('tenant_id', tenantId);
    }

    const { data: notifications } = await notificationsQuery;

    const notificationIds = notifications.map(n => n.id);
    let statsQuery = supabaseAdmin
        .from('notification_stats')
        .select('*')
        .in('notification_id', notificationIds);
    
    if (tenantId) {
        statsQuery = statsQuery.eq('tenant_id', tenantId);
    }
    
    const { data: stats } = await statsQuery;

    const statsMap = {};
    if (stats) {
        stats.forEach(s => {
            statsMap[s.notification_id] = s;
        });
    }

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
}

// trends処理
async function handleTrends(req, res) {
    const tenantId = req.query.tenant_id; // フルマネージド対応
    const period = req.query.period || '30d';
    const metric = req.query.metric || 'users';

    const now = new Date();
    let startDate = new Date();

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
        let usersQuery = supabaseAdmin
            .from('users')
            .select('created_at')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });
        
        if (tenantId) {
            usersQuery = usersQuery.eq('tenant_id', tenantId);
        }
        
        const { data: users } = await usersQuery;

        const dailyData = {};
        let cumulative = 0;
        const dateRange = [];
        for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            dateRange.push(dateStr);
            dailyData[dateStr] = { new: 0, total: 0 };
        }

        let initialUsersQuery = supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', startDate.toISOString());
        
        if (tenantId) {
            initialUsersQuery = initialUsersQuery.eq('tenant_id', tenantId);
        }
        
        const { count: initialUsers } = await initialUsersQuery;

        cumulative = initialUsers || 0;

        if (users) {
            users.forEach(user => {
                const dateStr = user.created_at.split('T')[0];
                if (dailyData[dateStr]) {
                    dailyData[dateStr].new++;
                }
            });
        }

        dateRange.forEach(dateStr => {
            cumulative += dailyData[dateStr].new;
            dataPoints.push({
                date: dateStr,
                value: cumulative,
                new: dailyData[dateStr].new
            });
        });
    } else if (metric === 'notifications') {
        let notificationsQuery = supabaseAdmin
            .from('notifications')
            .select('send_at, target_user_count')
            .eq('sent', true)
            .gte('send_at', startDate.toISOString())
            .order('send_at', { ascending: true });
        
        if (tenantId) {
            notificationsQuery = notificationsQuery.eq('tenant_id', tenantId);
        }
        
        const { data: notifications } = await notificationsQuery;

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
        let statsQuery = supabaseAdmin
            .from('notification_stats')
            .select('notification_id, open_rate, ctr, updated_at')
            .gte('updated_at', startDate.toISOString())
            .gt('total_sent', 0)
            .order('updated_at', { ascending: true });
        
        if (tenantId) {
            statsQuery = statsQuery.eq('tenant_id', tenantId);
        }
        
        const { data: stats } = await statsQuery;

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
}
