import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';
import { initWebPush } from '../../lib/webpush.js';

export default async function handler(req, res) {
    const action = req.query.action || 'list';

    if (action === 'send-now') {
        return await handleSendNow(req, res);
    }

    // デフォルトは一覧取得
    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const adminUser = await verifyAdmin(req);
    if (!adminUser) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const tenantId = req.query.tenant_id;

        let query = supabaseAdmin
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });

        // テナントIDでフィルタリング（フルマネージド対応）
        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: 'ok', data });
    } catch (err) {
        console.error('List error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

// 今すぐ送信処理
async function handleSendNow(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const adminUser2 = await verifyAdmin(req);
    if (!adminUser2) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const { notification_id } = req.body;

        if (!notification_id) {
            return res.status(400).json({ status: 'error', message: 'notification_id is required' });
        }

        // 通知を取得
        const { data: notification, error: notifError } = await supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('id', notification_id)
            .single();

        if (notifError || !notification) {
            return res.status(404).json({ status: 'error', message: 'Notification not found' });
        }

        // 既に送信済みの場合はエラー
        if (notification.sent) {
            return res.status(400).json({ status: 'error', message: 'Notification already sent' });
        }

        // Web Push初期化
        const webpush = initWebPush();

        // テナントIDでユーザーを取得
        let userQuery = supabaseAdmin.from('users').select('id, fcm_token');
        if (notification.tenant_id) {
            userQuery = userQuery.eq('tenant_id', notification.tenant_id);
        }

        const { data: allUsers, error: userError } = await userQuery;
        if (userError) throw userError;

        if (!allUsers || allUsers.length === 0) {
            // 対象ユーザーなしでも送信済みに更新
            await supabaseAdmin
                .from('notifications')
                .update({ sent: true, status: 'sent' })
                .eq('id', notification_id);
            return res.status(200).json({ 
                status: 'ok', 
                message: 'No target users',
                sent_count: 0,
                error_count: 0
            });
        }

        // 送信対象ユーザーを取得（フィルタリング対応）
        let targetUsers = allUsers;
        
        if (notification.target_type === 'segment' && notification.target_segment_id) {
            const { data: segment } = await supabaseAdmin
                .from('user_segments')
                .select('filter_conditions')
                .eq('id', notification.target_segment_id)
                .single();
            
            if (segment) {
                targetUsers = await getFilteredUsers(segment.filter_conditions, notification.tenant_id);
            }
        } else if (notification.target_type === 'custom_filter' && notification.target_filter) {
            targetUsers = await getFilteredUsers(notification.target_filter, notification.tenant_id);
        }

        if (!targetUsers || targetUsers.length === 0) {
            await supabaseAdmin
                .from('notifications')
                .update({ sent: false, status: 'no_target_users' })
                .eq('id', notification_id);
            return res.status(200).json({ 
                status: 'ok', 
                message: 'No target users after filtering',
                sent_count: 0,
                error_count: 0
            });
        }

        // 各ユーザーに通知送信
        let successCount = 0;
        let failureCount = 0;

        const sendPromises = targetUsers.map(async (user) => {
            try {
                let subscription;
                try {
                    subscription = JSON.parse(user.fcm_token);
                } catch (parseError) {
                    failureCount++;
                    return;
                }
                
                if (!subscription.endpoint || !subscription.keys) {
                    failureCount++;
                    return;
                }
                
                const payload = JSON.stringify({
                    title: notification.title,
                    body: notification.body,
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                    url: notification.url || '/',
                    notification_id: notification.id,
                    notification_type: 'scheduled',
                    user_id: user.id
                });

                await webpush.sendNotification(subscription, payload);
                successCount++;

                // 送信イベントを記録（非同期）
                recordSentEvent(notification.id, 'scheduled', user.id).catch(() => {});
            } catch (err) {
                failureCount++;
                
                // 無効なサブスクリプションの場合は削除
                if (err.statusCode === 410 || err.statusCode === 404) {
                    try {
                        await supabaseAdmin
                            .from('users')
                            .delete()
                            .eq('fcm_token', user.fcm_token);
                    } catch (deleteError) {
                        console.error('Failed to delete invalid subscription:', deleteError);
                    }
                }
            }
        });

        await Promise.all(sendPromises);

        // 送信結果に応じてステータスを更新
        if (successCount > 0) {
            await supabaseAdmin
                .from('notifications')
                .update({ sent: true, status: 'sent' })
                .eq('id', notification_id);
            
            // notification_stats の初期化（送信成功時のみ）
            const statsData = {
                notification_id: notification.id,
                notification_type: 'scheduled',
                total_sent: successCount,
                updated_at: new Date().toISOString()
            };
            
            // tenant_idが存在する場合は設定
            if (notification.tenant_id) {
                statsData.tenant_id = notification.tenant_id;
            }
            
            await supabaseAdmin
                .from('notification_stats')
                .upsert(statsData, {
                    onConflict: 'notification_id'
                });
        } else {
            // 送信数が0の場合は「送信失敗」として記録
            await supabaseAdmin
                .from('notifications')
                .update({ sent: false, status: 'failed' })
                .eq('id', notification_id);
        }

        return res.status(200).json({
            status: 'ok',
            message: 'Notification sent',
            sent_count: successCount,
            error_count: failureCount
        });
    } catch (err) {
        console.error('Send now error:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
}

// フィルター条件に基づいてユーザーを取得
async function getFilteredUsers(filterConditions, tenantId) {
    let query = supabaseAdmin.from('users').select('id, fcm_token');

    if (tenantId) {
        query = query.eq('tenant_id', tenantId);
    }

    if (!filterConditions || !filterConditions.conditions || !Array.isArray(filterConditions.conditions)) {
        const { data } = await query;
        return data || [];
    }

    filterConditions.conditions.forEach(condition => {
        const { field, operator: op, value } = condition;

        switch (field) {
            case 'registered_days_ago':
                if (op === 'gte') {
                    const date = new Date();
                    date.setDate(date.getDate() - value);
                    query = query.gte('created_at', date.toISOString());
                } else if (op === 'lte') {
                    const date = new Date();
                    date.setDate(date.getDate() - value);
                    query = query.lte('created_at', date.toISOString());
                }
                break;

            case 'device_type':
                if (op === 'eq') {
                    query = query.eq('device_type', value);
                } else if (op === 'in' && Array.isArray(value)) {
                    query = query.in('device_type', value);
                }
                break;

            case 'browser':
                if (op === 'eq') {
                    query = query.eq('browser', value);
                } else if (op === 'in' && Array.isArray(value)) {
                    query = query.in('browser', value);
                }
                break;
        }
    });

    const { data } = await query;
    return data || [];
}

// 送信イベントを記録
async function recordSentEvent(notificationId, notificationType, userId) {
    try {
        await supabaseAdmin
            .from('notification_events')
            .insert({
                notification_id: notificationId,
                notification_type: notificationType,
                user_id: userId,
                event_type: 'sent',
                metadata: {}
            });
    } catch (err) {
        console.error('Failed to record sent event:', err);
    }
}
