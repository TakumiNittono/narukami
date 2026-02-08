import { supabaseAdmin } from '../../lib/supabase.js';
import { initWebPush } from '../../lib/webpush.js';

export default async function handler(req, res) {
    // Vercel Cron認証
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        // Web Push初期化
        const webpush = initWebPush();

        // ===== STEP 1: 未送信通知を取得 =====
        const { data: notifications, error: notifError } = await supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('sent', false)
            .lte('send_at', new Date().toISOString())
            .order('send_at', { ascending: true });

        if (notifError) throw notifError;

        if (!notifications || notifications.length === 0) {
            return res.status(200).json({ status: 'ok', message: 'No pending notifications' });
        }

        // ===== STEP 2: 全ユーザートークン取得 =====
        const { data: users, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, fcm_token'); // 実際はsubscription JSON

        if (userError) throw userError;

        if (!users || users.length === 0) {
            return res.status(200).json({ status: 'ok', message: 'No users to send' });
        }

        const results = [];

        // ===== STEP 3: 通知ごとに送信 =====
        for (const notification of notifications) {
            let successCount = 0;
            let failureCount = 0;

            // 送信対象ユーザーを取得（フィルタリング対応）
            let targetUsers = users;
            
            if (notification.target_type === 'segment' && notification.target_segment_id) {
                // セグメント指定の場合
                const { data: segment } = await supabaseAdmin
                    .from('user_segments')
                    .select('filter_conditions')
                    .eq('id', notification.target_segment_id)
                    .single();
                
                if (segment) {
                    targetUsers = await getFilteredUsers(segment.filter_conditions);
                }
            } else if (notification.target_type === 'custom_filter' && notification.target_filter) {
                // カスタムフィルター指定の場合
                targetUsers = await getFilteredUsers(notification.target_filter);
            }
            // target_type === 'all' の場合は全ユーザーを使用

            if (!targetUsers || targetUsers.length === 0) {
                console.log(`[Cron] 通知ID:${notification.id} 対象ユーザーなし`);
                // 送信済みに更新
                await supabaseAdmin
                    .from('notifications')
                    .update({ sent: true, status: 'sent' })
                    .eq('id', notification.id);
                continue;
            }

            // 各ユーザーに通知送信
            const sendPromises = targetUsers.map(async (user) => {
                try {
                    // fcm_tokenカラムに保存されたサブスクリプションJSONをパース
                    let subscription;
                    try {
                        subscription = JSON.parse(user.fcm_token);
                    } catch (parseError) {
                        console.error('Failed to parse subscription JSON:', parseError);
                        failureCount++;
                        return;
                    }
                    
                    // サブスクリプションの形式チェック
                    if (!subscription.endpoint || !subscription.keys) {
                        console.error('Invalid subscription format:', subscription);
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
                        notification_type: 'scheduled'
                    });

                    await webpush.sendNotification(subscription, payload);
                    successCount++;
                    
                    // 送信イベントを記録（非同期、エラーは無視）
                    recordSentEvent(notification.id, 'scheduled', user.id).catch(err => {
                        console.error('Failed to record sent event:', err);
                    });
                } catch (err) {
                    console.error('Send notification error:', err);
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

            // ===== STEP 4: 送信済みに更新 =====
            await supabaseAdmin
                .from('notifications')
                .update({ sent: true, status: 'sent' })
                .eq('id', notification.id);
            
            // notification_stats の初期化（送信数だけ設定）
            await supabaseAdmin
                .from('notification_stats')
                .upsert({
                    notification_id: notification.id,
                    notification_type: 'scheduled',
                    total_sent: successCount,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'notification_id'
                });

            results.push({
                id: notification.id,
                title: notification.title,
                success: successCount,
                failure: failureCount,
            });

            console.log(
                `[Cron] 通知ID:${notification.id} 送信完了 `
                + `成功:${successCount} 失敗:${failureCount}`
            );
        }

        return res.status(200).json({
            status: 'ok',
            message: `${notifications.length} notifications sent`,
            results,
        });
    } catch (err) {
        console.error('[Cron] Error:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
}

// 送信イベントを記録するヘルパー関数
async function recordSentEvent(notificationId, notificationType, userId) {
    await supabaseAdmin
        .from('notification_events')
        .insert({
            notification_id: notificationId,
            notification_type: notificationType,
            user_id: userId || null,
            event_type: 'sent'
        });
}

// フィルター条件に基づいてユーザーを取得するヘルパー関数
async function getFilteredUsers(filterConditions) {
    let query = supabaseAdmin.from('users').select('id, fcm_token');

    if (!filterConditions || !filterConditions.conditions || !Array.isArray(filterConditions.conditions)) {
        // フィルター条件がない場合は全ユーザー
        const { data } = await query;
        return data || [];
    }

    // フィルター条件を適用
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

            case 'has_tag':
                // タグを持つユーザー（サブクエリが必要、簡易実装ではスキップ）
                break;
        }
    });

    const { data } = await query;
    return data || [];
}
