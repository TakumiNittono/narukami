import { supabaseAdmin } from '../../lib/supabase.js';

// 通知クリックイベントを記録するAPI（認証不要・Service Workerから呼び出し）
export default async function handler(req, res) {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { notification_id, notification_type = 'scheduled', user_id, url, metadata = {} } = req.body;

    if (!notification_id) {
        return res.status(400).json({ status: 'error', message: 'notification_id is required' });
    }

    try {
        // notification_events に記録
        const eventMetadata = {
            ...metadata,
            url: url || null
        };

        const { error: eventError } = await supabaseAdmin
            .from('notification_events')
            .insert({
                notification_id,
                notification_type,
                user_id: user_id || null,
                event_type: 'click',
                metadata: eventMetadata
            });

        if (eventError) throw eventError;

        // notification_stats を更新（非同期で実行、エラーは無視）
        updateNotificationStats(notification_id, 'click').catch(err => {
            console.error('Stats update error (non-blocking):', err);
        });

        return res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('Track click error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

// notification_stats を更新するヘルパー関数
async function updateNotificationStats(notificationId, eventType) {
    // 該当通知のイベントを集計
    const { data: events, error } = await supabaseAdmin
        .from('notification_events')
        .select('event_type')
        .eq('notification_id', notificationId);

    if (error) throw error;

    const stats = {
        total_sent: events.filter(e => e.event_type === 'sent').length,
        total_delivered: events.filter(e => e.event_type === 'delivered').length,
        total_opened: events.filter(e => e.event_type === 'open').length,
        total_clicked: events.filter(e => e.event_type === 'click').length,
        total_dismissed: events.filter(e => e.event_type === 'dismiss').length,
    };

    // 開封率・CTRを計算
    const openRate = stats.total_sent > 0 
        ? (stats.total_opened / stats.total_sent * 100).toFixed(2)
        : 0;
    const ctr = stats.total_sent > 0
        ? (stats.total_clicked / stats.total_sent * 100).toFixed(2)
        : 0;

    // notification_type を取得
    const { data: notification } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('id', notificationId)
        .single();

    const notificationType = notification ? 'scheduled' : 'step';

    // upsert
    const { error: upsertError } = await supabaseAdmin
        .from('notification_stats')
        .upsert({
            notification_id: notificationId,
            notification_type: notificationType,
            ...stats,
            open_rate: parseFloat(openRate),
            ctr: parseFloat(ctr),
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'notification_id'
        });

    if (upsertError) throw upsertError;
}
