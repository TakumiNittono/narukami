import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// ユーザー管理API統合版（?action=list|detail|events）
export default async function handler(req, res) {
    const adminUser = await verifyAdmin(req);
    if (!adminUser) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action || 'list';
    const tenantId = req.query.tenant_id ? parseInt(req.query.tenant_id) : null;

    try {
        if (action === 'list') {
            return await handleList(req, res, tenantId);
        } else if (action === 'detail') {
            return await handleDetail(req, res, tenantId);
        } else if (action === 'events') {
            return await handleEvents(req, res, tenantId);
        } else if (action === 'delete') {
            if (req.method !== 'POST') {
                return res.status(405).json({ status: 'error', message: 'Method not allowed' });
            }
            return await handleDelete(req, res, tenantId);
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid action parameter' });
        }
    } catch (err) {
        console.error('Users API error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

// ユーザー一覧取得
async function handleList(req, res, tenantId) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let usersQuery = supabaseAdmin
        .from('users')
        .select('id, fcm_token, tenant_id, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (tenantId) {
        usersQuery = usersQuery.eq('tenant_id', tenantId);
    }

    const { data: users, error: usersError } = await usersQuery;

    if (usersError) throw usersError;

    // 総件数を取得
    let countQuery = supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true });

    if (tenantId) {
        countQuery = countQuery.eq('tenant_id', tenantId);
    }

    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    // テナントごとの配信済み通知数をまとめて取得（N+1回避）
    const tenantIds = [...new Set((users || []).map(u => u.tenant_id).filter(Boolean))];
    const tenantSentMap = {};
    await Promise.all(tenantIds.map(async (tid) => {
        const { count } = await supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tid)
            .eq('sent', true);
        tenantSentMap[tid] = count || 0;
    }));

    // 各ユーザーの統計情報を取得
    const usersWithStats = await Promise.all(
        (users || []).map(async (user) => {
            // ユーザーが開封した通知数
            const { data: openEvents } = await supabaseAdmin
                .from('notification_events')
                .select('id')
                .eq('user_id', user.id)
                .eq('event_type', 'open');

            // ユーザーがクリックした通知数（notification_idでユニーク化）
            const { data: clickEvents } = await supabaseAdmin
                .from('notification_events')
                .select('notification_id')
                .eq('user_id', user.id)
                .eq('event_type', 'click');

            // 配信数 = そのテナントに送られた通知数（notifications.sent=true）
            const totalSent = user.tenant_id ? (tenantSentMap[user.tenant_id] || 0) : 0;
            const totalOpened = openEvents?.length || 0;
            const uniqueClicked = new Set((clickEvents || []).map(e => e.notification_id)).size;

            const ctr = totalSent > 0 ? ((uniqueClicked / totalSent) * 100).toFixed(1) : '0.0';

            // fcm_tokenからデバイス情報を抽出（可能な場合）
            let deviceInfo = 'Unknown';
            try {
                const subscription = JSON.parse(user.fcm_token);
                if (subscription.endpoint) {
                    if (subscription.endpoint.includes('fcm.googleapis.com')) {
                        deviceInfo = 'Android';
                    } else if (subscription.endpoint.includes('wns2')) {
                        deviceInfo = 'Windows';
                    } else if (subscription.endpoint.includes('updates.push.services.mozilla.com')) {
                        deviceInfo = 'Firefox';
                    } else {
                        deviceInfo = 'Web';
                    }
                }
            } catch (e) {
                // パースエラーは無視
            }

            return {
                id: user.id,
                device_info: deviceInfo,
                created_at: user.created_at,
                tenant_id: user.tenant_id,
                stats: {
                    total_sent: totalSent,
                    total_opened: totalOpened,
                    total_clicked: uniqueClicked,
                    ctr: parseFloat(ctr)
                }
            };
        })
    );

    return res.status(200).json({
        status: 'ok',
        data: {
            users: usersWithStats,
            pagination: {
                page,
                limit,
                total: count || 0,
                total_pages: Math.ceil((count || 0) / limit)
            }
        }
    });
}

// ユーザー詳細取得
async function handleDetail(req, res, tenantId) {
    const userId = parseInt(req.query.user_id || req.query.id);

    if (!userId) {
        return res.status(400).json({ status: 'error', message: 'user_id is required' });
    }

    // ユーザー情報を取得
    let userQuery = supabaseAdmin
        .from('users')
        .select('id, fcm_token, tenant_id, created_at')
        .eq('id', userId)
        .single();

    const { data: user, error: userError } = await userQuery;

    if (userError || !user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // テナントIDフィルタリング
    if (tenantId && user.tenant_id !== tenantId) {
        return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    // 統計情報を取得
    const [openEventsRes, clickEventsRes, sentCountRes] = await Promise.all([
        supabaseAdmin.from('notification_events').select('id').eq('user_id', user.id).eq('event_type', 'open'),
        supabaseAdmin.from('notification_events').select('notification_id').eq('user_id', user.id).eq('event_type', 'click'),
        user.tenant_id
            ? supabaseAdmin.from('notifications').select('*', { count: 'exact', head: true }).eq('tenant_id', user.tenant_id).eq('sent', true)
            : Promise.resolve({ count: 0 })
    ]);

    const totalSent = sentCountRes.count || 0;
    const totalOpened = openEventsRes.data?.length || 0;
    const uniqueClicked = new Set((clickEventsRes.data || []).map(e => e.notification_id)).size;

    const ctr = totalSent > 0 ? ((uniqueClicked / totalSent) * 100).toFixed(1) : '0.0';

    // デバイス情報を抽出
    let deviceInfo = 'Unknown';
    let endpoint = null;
    try {
        const subscription = JSON.parse(user.fcm_token);
        endpoint = subscription.endpoint;
        if (subscription.endpoint) {
            if (subscription.endpoint.includes('fcm.googleapis.com')) {
                deviceInfo = 'Android';
            } else if (subscription.endpoint.includes('wns2')) {
                deviceInfo = 'Windows';
            } else if (subscription.endpoint.includes('updates.push.services.mozilla.com')) {
                deviceInfo = 'Firefox';
            } else {
                deviceInfo = 'Web';
            }
        }
    } catch (e) {
        // パースエラーは無視
    }

    return res.status(200).json({
        status: 'ok',
        data: {
            id: user.id,
            device_info: deviceInfo,
            endpoint: endpoint,
            created_at: user.created_at,
            tenant_id: user.tenant_id,
            stats: {
                total_sent: totalSent,
                total_opened: totalOpened,
                total_clicked: uniqueClicked,
                ctr: parseFloat(ctr)
            }
        }
    });
}

// ユーザーのイベント履歴取得
async function handleEvents(req, res, tenantId) {
    const userId = parseInt(req.query.user_id || req.query.id);
    const limit = parseInt(req.query.limit) || 100;

    if (!userId) {
        return res.status(400).json({ status: 'error', message: 'user_id is required' });
    }

    // ユーザーが存在するか確認
    let userQuery = supabaseAdmin
        .from('users')
        .select('id, tenant_id')
        .eq('id', userId)
        .single();

    const { data: user, error: userError } = await userQuery;

    if (userError || !user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // テナントIDフィルタリング
    if (tenantId && user.tenant_id !== tenantId) {
        return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    // イベント履歴を取得
    const { data: events, error: eventsError } = await supabaseAdmin
        .from('notification_events')
        .select(`
            id,
            notification_id,
            notification_type,
            event_type,
            metadata,
            created_at
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (eventsError) throw eventsError;

    // 通知情報を取得（タイトルなど）
    const notificationIds = [...new Set((events || []).map(e => e.notification_id).filter(Boolean))];
    
    let notificationsMap = {};
    if (notificationIds.length > 0) {
        const { data: notifications } = await supabaseAdmin
            .from('notifications')
            .select('id, title, body')
            .in('id', notificationIds);

        if (notifications) {
            notifications.forEach(n => {
                notificationsMap[n.id] = n;
            });
        }
    }

    // ステップ通知情報も取得
    const stepNotificationIds = [...new Set((events || []).filter(e => e.notification_type === 'step').map(e => e.notification_id).filter(Boolean))];
    
    let stepNotificationsMap = {};
    if (stepNotificationIds.length > 0) {
        const { data: stepNotifications } = await supabaseAdmin
            .from('step_notifications')
            .select('id, title, body')
            .in('id', stepNotificationIds);

        if (stepNotifications) {
            stepNotifications.forEach(n => {
                stepNotificationsMap[n.id] = n;
            });
        }
    }

    const eventsWithDetails = (events || []).map(event => {
        const notification = event.notification_type === 'step' 
            ? stepNotificationsMap[event.notification_id]
            : notificationsMap[event.notification_id];

        return {
            id: event.id,
            notification_id: event.notification_id,
            notification_type: event.notification_type,
            notification_title: notification?.title || '不明な通知',
            event_type: event.event_type,
            metadata: event.metadata,
            created_at: event.created_at
        };
    });

    return res.status(200).json({
        status: 'ok',
        data: {
            user_id: userId,
            events: eventsWithDetails,
            total: eventsWithDetails.length
        }
    });
}

// ユーザー削除
async function handleDelete(req, res, tenantId) {
    // bodyのパース（Vercel環境によっては未パースの可能性）
    let body = req.body;
    if (typeof body === 'string' && body) {
        try {
            body = JSON.parse(body);
        } catch (e) {
            body = {};
        }
    }
    body = body || {};

    const userId = parseInt(body.user_id || req.query?.user_id);

    if (!userId || isNaN(userId)) {
        return res.status(400).json({ status: 'error', message: 'user_id is required' });
    }

    // ユーザーが存在するか確認
    const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, tenant_id')
        .eq('id', userId)
        .maybeSingle();

    if (userError) {
        console.error('User lookup error:', userError);
        return res.status(500).json({ status: 'error', message: 'Failed to verify user', detail: userError.message });
    }

    if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // テナントIDフィルタリング（マルチテナント時は自テナントのユーザーのみ削除可能）
    // tenant_idがnullのユーザーは従来データのため許可
    if (tenantId != null && user.tenant_id != null && Number(user.tenant_id) !== Number(tenantId)) {
        return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    // ユーザー削除（外部キーON DELETE CASCADE/SET NULLで関連データも処理される）
    const { error: deleteError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', userId);

    if (deleteError) {
        console.error('User delete error:', deleteError);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to delete user',
            detail: deleteError.message
        });
    }

    return res.status(200).json({
        status: 'ok',
        message: 'User deleted successfully',
        data: { deleted_id: userId }
    });
}
