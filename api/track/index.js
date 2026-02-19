import { supabaseAdmin } from '../../lib/supabase.js';

// トラッキングAPI統合版（event_typeで分岐）
// CORS は vercel.json でグローバル設定済み
export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { event_type, notification_id, notification_type = 'scheduled', user_id, url, metadata = {} } = req.body;

    if (!notification_id || !event_type) {
        return res.status(400).json({ status: 'error', message: 'notification_id and event_type are required' });
    }

    if (event_type !== 'open' && event_type !== 'click') {
        return res.status(400).json({ status: 'error', message: 'event_type must be "open" or "click"' });
    }

    try {
        const eventMetadata = event_type === 'click' ? { ...metadata, url: url || null } : metadata;

        const { error: eventError } = await supabaseAdmin
            .from('notification_events')
            .insert({
                notification_id,
                notification_type,
                user_id: user_id || null,
                event_type,
                metadata: eventMetadata
            });

        if (eventError) throw eventError;

        // notification_stats を更新（非同期で実行、エラーは無視）
        updateNotificationStats(notification_id, event_type).catch(err => {
            console.error('Stats update error (non-blocking):', err);
        });

        return res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('Track error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function updateNotificationStats(notificationId, eventType) {
    const { data: events } = await supabaseAdmin
        .from('notification_events')
        .select('event_type')
        .eq('notification_id', notificationId);

    const stats = {
        total_sent: events.filter(e => e.event_type === 'sent').length,
        total_delivered: events.filter(e => e.event_type === 'delivered').length,
        total_opened: events.filter(e => e.event_type === 'open').length,
        total_clicked: events.filter(e => e.event_type === 'click').length,
        total_dismissed: events.filter(e => e.event_type === 'dismiss').length,
    };

    const openRate = stats.total_sent > 0 
        ? (stats.total_opened / stats.total_sent * 100).toFixed(2)
        : 0;
    const ctr = stats.total_sent > 0
        ? (stats.total_clicked / stats.total_sent * 100).toFixed(2)
        : 0;

    // 通知情報を取得（tenant_idを含む）
    const { data: notification } = await supabaseAdmin
        .from('notifications')
        .select('id, tenant_id')
        .eq('id', notificationId)
        .single();

    const notificationType = notification ? 'scheduled' : 'step';
    const tenantId = notification ? notification.tenant_id : null;

    const upsertData = {
        notification_id: notificationId,
        notification_type: notificationType,
        ...stats,
        open_rate: parseFloat(openRate),
        ctr: parseFloat(ctr),
        updated_at: new Date().toISOString()
    };

    // tenant_idが存在する場合は設定
    if (tenantId) {
        upsertData.tenant_id = tenantId;
    }

    const { error: upsertError } = await supabaseAdmin
        .from('notification_stats')
        .upsert(upsertData, {
            onConflict: 'notification_id'
        });

    if (upsertError) {
        console.error('notification_stats upsert error:', upsertError);
    }
}
