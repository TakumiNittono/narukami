import { supabaseAdmin } from '../../lib/supabase.js';
import webpush from 'web-push';

// Web Push の VAPID キーを設定
webpush.setVapidDetails(
    'mailto:' + process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
    // Vercel Cron からのリクエストのみ受け付ける
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        console.log('[Step Cron] Starting step notification job...');

        // 配信予定時刻を過ぎた未完了の進捗を取得
        const { data: pendingProgress, error: progressError } = await supabaseAdmin
            .from('user_step_progress')
            .select(`
                id,
                user_id,
                sequence_id,
                current_step,
                next_notification_at,
                users!inner(id, fcm_token)
            `)
            .eq('completed', false)
            .lte('next_notification_at', new Date().toISOString())
            .limit(100); // 一度に処理する件数を制限

        if (progressError) throw progressError;

        if (!pendingProgress || pendingProgress.length === 0) {
            console.log('[Step Cron] No pending notifications found');
            return res.status(200).json({ status: 'ok', message: 'No pending notifications', sent: 0 });
        }

        console.log(`[Step Cron] Found ${pendingProgress.length} pending notifications`);

        let successCount = 0;
        let failureCount = 0;

        // 各進捗について処理
        for (const progress of pendingProgress) {
            try {
                // 次に送信するステップ番号（current_step + 1）
                const nextStepOrder = progress.current_step + 1;

                // 該当するステップ通知を取得
                const { data: stepNotification, error: stepError } = await supabaseAdmin
                    .from('step_notifications')
                    .select('*')
                    .eq('sequence_id', progress.sequence_id)
                    .eq('step_order', nextStepOrder)
                    .single();

                if (stepError || !stepNotification) {
                    // 次のステップが存在しない場合はシーケンス完了
                    await supabaseAdmin
                        .from('user_step_progress')
                        .update({ completed: true, updated_at: new Date().toISOString() })
                        .eq('id', progress.id);
                    
                    console.log(`[Step Cron] Sequence completed for user ${progress.user_id}`);
                    continue;
                }

                // 通知を送信
                const subscription = JSON.parse(progress.users.fcm_token);
                const payload = JSON.stringify({
                    title: stepNotification.title,
                    body: stepNotification.body,
                    url: stepNotification.url || '/',
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png'
                });

                await webpush.sendNotification(subscription, payload);

                // 送信ログを記録
                await supabaseAdmin
                    .from('step_notification_logs')
                    .insert({
                        user_id: progress.user_id,
                        sequence_id: progress.sequence_id,
                        step_notification_id: stepNotification.id,
                        step_order: nextStepOrder,
                        success: true
                    });

                // 次のステップがあるか確認
                const { data: nextStep, error: nextStepError } = await supabaseAdmin
                    .from('step_notifications')
                    .select('*')
                    .eq('sequence_id', progress.sequence_id)
                    .eq('step_order', nextStepOrder + 1)
                    .single();

                if (nextStepError || !nextStep) {
                    // 次のステップがない場合はシーケンス完了
                    await supabaseAdmin
                        .from('user_step_progress')
                        .update({
                            current_step: nextStepOrder,
                            completed: true,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', progress.id);
                } else {
                    // 次のステップがある場合は進捗を更新
                    const nextNotificationAt = calculateNextNotificationTime(nextStep);

                    await supabaseAdmin
                        .from('user_step_progress')
                        .update({
                            current_step: nextStepOrder,
                            next_notification_at: nextNotificationAt,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', progress.id);
                }

                successCount++;
                console.log(`[Step Cron] Sent step ${nextStepOrder} to user ${progress.user_id}`);

            } catch (err) {
                failureCount++;
                console.error(`[Step Cron] Failed to send to user ${progress.user_id}:`, err);

                // 失敗ログを記録
                try {
                    const nextStepOrder = progress.current_step + 1;
                    const { data: stepNotification } = await supabaseAdmin
                        .from('step_notifications')
                        .select('id')
                        .eq('sequence_id', progress.sequence_id)
                        .eq('step_order', nextStepOrder)
                        .single();

                    if (stepNotification) {
                        await supabaseAdmin
                            .from('step_notification_logs')
                            .insert({
                                user_id: progress.user_id,
                                sequence_id: progress.sequence_id,
                                step_notification_id: stepNotification.id,
                                step_order: nextStepOrder,
                                success: false,
                                error_message: err.message || 'Unknown error'
                            });
                    }
                } catch (logErr) {
                    console.error('[Step Cron] Failed to log error:', logErr);
                }
            }
        }

        console.log(`[Step Cron] Job completed. Success: ${successCount}, Failure: ${failureCount}`);

        return res.status(200).json({
            status: 'ok',
            message: 'Step notifications sent',
            sent: successCount,
            failed: failureCount
        });
    } catch (err) {
        console.error('[Step Cron] Job error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

/**
 * ステップの配信タイミング設定から次の配信時刻を計算
 */
function calculateNextNotificationTime(step) {
    const now = new Date();

    switch (step.delay_type) {
        case 'immediate':
            return now.toISOString();
        
        case 'minutes':
            now.setMinutes(now.getMinutes() + step.delay_value);
            return now.toISOString();
        
        case 'hours':
            now.setHours(now.getHours() + step.delay_value);
            return now.toISOString();
        
        case 'days':
            now.setDate(now.getDate() + step.delay_value);
            return now.toISOString();
        
        case 'scheduled':
            if (!step.scheduled_time) return now.toISOString();
            
            // scheduled_time は "HH:MM:SS" 形式
            const [hours, minutes, seconds] = step.scheduled_time.split(':').map(Number);
            const scheduled = new Date();
            scheduled.setHours(hours, minutes, seconds || 0, 0);
            
            // もし今日の指定時刻が既に過ぎていたら翌日に設定
            if (scheduled <= now) {
                scheduled.setDate(scheduled.getDate() + 1);
            }
            
            return scheduled.toISOString();
        
        default:
            return now.toISOString();
    }
}
