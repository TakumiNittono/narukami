import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// レポート管理API統合版（?action=list|create|get）
export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const action = req.query.action || (req.method === 'GET' ? 'list' : 'create');

    try {
        if (action === 'list') {
            return await handleList(req, res);
        } else if (action === 'create') {
            return await handleCreate(req, res);
        } else if (action === 'get') {
            return await handleGet(req, res);
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid action parameter' });
        }
    } catch (err) {
        console.error('Reports error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function handleList(req, res) {
    const tenantId = req.query.tenant_id;

    let query = supabaseAdmin
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (tenantId) {
        query = query.eq('tenant_id', tenantId);
    }

    const { data: reports } = await query;

    return res.status(200).json({
        status: 'ok',
        data: reports
    });
}

async function handleCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { tenant_id, report_type, period_start, period_end, title, summary, data } = req.body;

    if (!tenant_id || !report_type || !period_start || !period_end || !title) {
        return res.status(400).json({
            status: 'error',
            message: 'tenant_id, report_type, period_start, period_end, and title are required'
        });
    }

    // レポートデータを自動生成（通知統計から）
    let reportData = data || {};

    if (!data) {
        // 期間内の通知統計を取得
        const { data: notifications } = await supabaseAdmin
            .from('notifications')
            .select('id, title, send_at, target_user_count')
            .eq('tenant_id', tenant_id)
            .eq('sent', true)
            .gte('send_at', period_start)
            .lte('send_at', period_end);

        const notificationIds = notifications.map(n => n.id);
        let stats = {};

        if (notificationIds.length > 0) {
            const { data: notificationStats } = await supabaseAdmin
                .from('notification_stats')
                .select('*')
                .in('notification_id', notificationIds);

            stats = notificationStats || [];
        }

        // 集計
        const totalSent = notifications.reduce((sum, n) => sum + (n.target_user_count || 0), 0);
        const totalOpened = stats.reduce((sum, s) => sum + s.total_opened, 0);
        const totalClicked = stats.reduce((sum, s) => sum + s.total_clicked, 0);
        const avgOpenRate = stats.length > 0
            ? stats.reduce((sum, s) => sum + s.open_rate, 0) / stats.length
            : 0;
        const avgCtr = stats.length > 0
            ? stats.reduce((sum, s) => sum + s.ctr, 0) / stats.length
            : 0;

        reportData = {
            total_notifications: notifications.length,
            total_sent,
            total_opened,
            total_clicked,
            avg_open_rate: parseFloat(avgOpenRate.toFixed(2)),
            avg_ctr: parseFloat(avgCtr.toFixed(2)),
            notifications: notifications.map(n => {
                const stat = stats.find(s => s.notification_id === n.id);
                return {
                    id: n.id,
                    title: n.title,
                    sent: n.target_user_count || 0,
                    opened: stat?.total_opened || 0,
                    clicked: stat?.total_clicked || 0,
                    open_rate: stat?.open_rate || 0,
                    ctr: stat?.ctr || 0
                };
            })
        };
    }

    const { data: report } = await supabaseAdmin
        .from('reports')
        .insert({
            tenant_id,
            report_type,
            period_start,
            period_end,
            title,
            summary: summary || '',
            data: reportData
        })
        .select()
        .single();

    return res.status(200).json({
        status: 'ok',
        message: 'Report created',
        data: report
    });
}

async function handleGet(req, res) {
    const reportId = req.query.id;

    if (!reportId) {
        return res.status(400).json({
            status: 'error',
            message: 'id is required'
        });
    }

    const { data: report } = await supabaseAdmin
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single();

    if (!report) {
        return res.status(404).json({
            status: 'error',
            message: 'Report not found'
        });
    }

    return res.status(200).json({
        status: 'ok',
        data: report
    });
}
