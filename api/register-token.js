import { supabaseAdmin } from '../lib/supabase.js';
import webpush from 'web-push';

// Web Push の VAPID キーを設定
if (process.env.VAPID_EMAIL && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:' + process.env.VAPID_EMAIL,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    let body = req.body;
    if (typeof body === 'string' && body) {
        try {
            body = JSON.parse(body);
        } catch (e) {
            body = {};
        }
    }
    body = body || {};
    const { subscription, domain } = body;

    if (!subscription) {
        return res.status(400).json({ status: 'error', message: 'Subscription is required' });
    }

    if (!subscription.endpoint || typeof subscription.endpoint !== 'string') {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Invalid subscription: endpoint is required and must be a string' 
        });
    }

    // endpointの形式チェック（URL形式であることを確認）
    try {
        new URL(subscription.endpoint);
    } catch (e) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Invalid subscription: endpoint must be a valid URL' 
        });
    }

    try {
        // ドメインからtenant_idを取得
        let tenantId = null;
        if (domain) {
            try {
                // tenant_domainsテーブルからtenant_idを取得
                const { data: tenantDomain } = await supabaseAdmin
                    .from('tenant_domains')
                    .select('tenant_id')
                    .eq('domain', domain)
                    .single();
                
                if (tenantDomain) {
                    tenantId = tenantDomain.tenant_id;
                } else {
                    // tenant_domainsにない場合はtenantsテーブルから直接取得
                    const { data: tenant } = await supabaseAdmin
                        .from('tenants')
                        .select('id')
                        .eq('domain', domain)
                        .single();
                    
                    if (tenant) {
                        tenantId = tenant.id;
                    }
                }
            } catch (err) {
                console.error('Failed to get tenant_id from domain:', err);
            }
        }
        
        // サブスクリプション情報をJSON文字列として保存
        // fcm_tokenカラムにサブスクリプションJSON全体を保存
        // endpointはユニークなので、同じendpointの場合は上書きされる
        const subscriptionJson = JSON.stringify(subscription);
        
        // 既存のendpointをチェックして、存在する場合は更新、存在しない場合は挿入
        // 全ユーザーを取得してJavaScriptでフィルタリング（LIKEクエリのエスケープ問題を回避）
        const { data: allUsers, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('id, fcm_token, tenant_id');
        
        if (fetchError) throw fetchError;
        
        // endpointで既存ユーザーを検索
        const existing = allUsers?.find(user => {
            try {
                const userSub = JSON.parse(user.fcm_token);
                return userSub.endpoint === subscription.endpoint;
            } catch (e) {
                return false;
            }
        });
        
        let userId;
        let isNewUser = false;

        if (existing) {
            // 既存のレコードを更新（tenant_idも更新）
            const updateData = { fcm_token: subscriptionJson };
            if (tenantId && !existing.tenant_id) {
                // tenant_idが設定されていない場合のみ更新
                updateData.tenant_id = tenantId;
            }
            
            const { error } = await supabaseAdmin
                .from('users')
                .update(updateData)
                .eq('id', existing.id);
            
            if (error) throw error;
            userId = existing.id;
        } else {
            // 新規レコードを挿入（tenant_idも設定）
            const insertData = { fcm_token: subscriptionJson };
            if (tenantId) {
                insertData.tenant_id = tenantId;
            }
            
            const { data: newUser, error } = await supabaseAdmin
                .from('users')
                .insert(insertData)
                .select()
                .single();
            
            if (error) {
                // UNIQUE制約違反の場合は更新を試みる
                if (error.code === '23505') {
                    const { data: updatedUser, error: updateError } = await supabaseAdmin
                        .from('users')
                        .update({ fcm_token: subscriptionJson })
                        .eq('fcm_token', subscriptionJson)
                        .select()
                        .single();
                    
                    if (updateError) throw updateError;
                    userId = updatedUser.id;
                } else {
                    throw error;
                }
            } else {
                userId = newUser.id;
                isNewUser = true;
            }
        }

        // 新規ユーザー、または既存ユーザーで未登録の場合にステップ配信へ登録
        if (userId) {
            const shouldEnroll = isNewUser || await needsStepEnrollment(userId);
            if (shouldEnroll) {
                await enrollUserInStepSequences(userId, tenantId, subscription);
            }
        }

        return res.status(200).json({ status: 'ok', message: 'Subscription registered' });
    } catch (err) {
        console.error('Subscription registration error:', err);
        const errorMessage = err.message || 'Internal server error';
        return res.status(500).json({ 
            status: 'error', 
            message: errorMessage,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
}

/**
 * ユーザーがステップ配信に未登録か確認（既存ユーザーの再登録対応）
 */
async function needsStepEnrollment(userId) {
    const { data, error } = await supabaseAdmin
        .from('user_step_progress')
        .select('id')
        .eq('user_id', userId)
        .limit(1);
    return !error && (!data || data.length === 0);
}

/**
 * 新規ユーザーを有効なステップ配信シーケンスに登録する
 * 即時配信のステップは登録時にすぐ送信（Cron待ちの最大5分遅延を解消）
 */
async function enrollUserInStepSequences(userId, tenantId, subscription) {
    try {
        // 有効なシーケンスを取得（テナントIDでフィルタリング、tenant_id=nullも含む）
        let seqQuery = supabaseAdmin
            .from('step_sequences')
            .select('id')
            .eq('is_active', true);
        
        if (tenantId !== null && !isNaN(tenantId)) {
            seqQuery = seqQuery.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
        }
        
        let activeSequences;
        let seqError;
        ({ data: activeSequences, error: seqError } = await seqQuery);

        if (seqError) {
            console.error('Failed to fetch active sequences (retrying without tenant filter):', seqError);
            const fallback = await supabaseAdmin
                .from('step_sequences')
                .select('id')
                .eq('is_active', true);
            if (fallback.error) {
                console.error('Fallback query also failed:', fallback.error);
                return;
            }
            activeSequences = fallback.data;
        }

        if (!activeSequences || activeSequences.length === 0) {
            console.log('No active sequences found');
            return;
        }

        // 各シーケンスのステップ1を取得して進捗を作成
        for (const sequence of activeSequences) {
            const { data: firstStep, error: stepError } = await supabaseAdmin
                .from('step_notifications')
                .select('*')
                .eq('sequence_id', sequence.id)
                .eq('step_order', 1)
                .single();

            if (stepError || !firstStep) {
                console.error(`No first step found for sequence ${sequence.id}`);
                continue;
            }

            // 次の配信時刻を計算
            const nextNotificationAt = calculateNextNotificationTime(firstStep);

            // 進捗レコードを作成
            const { data: progressRecord, error: progressError } = await supabaseAdmin
                .from('user_step_progress')
                .insert({
                    user_id: userId,
                    sequence_id: sequence.id,
                    current_step: 0, // 0 = 未開始
                    next_notification_at: nextNotificationAt
                })
                .select('id')
                .single();

            if (progressError) {
                console.error(`Failed to create progress for sequence ${sequence.id}:`, progressError);
                continue;
            }

            // 即時配信の場合は登録直後に送信（Cronの5分待ちを回避）
            if (firstStep.delay_type === 'immediate' && subscription) {
                await sendImmediateStep(userId, sequence.id, progressRecord.id, firstStep, subscription);
            }
        }
    } catch (err) {
        console.error('Failed to enroll user in step sequences:', err);
    }
}

/**
 * 即時ステップを登録直後に送信
 */
async function sendImmediateStep(userId, sequenceId, progressId, stepNotification, subscription) {
    try {
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.log('[Register] VAPID keys not configured, skipping immediate send');
            return;
        }

        const payload = JSON.stringify({
            title: stepNotification.title,
            body: stepNotification.body,
            url: stepNotification.url || '/',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            notification_id: stepNotification.id,
            notification_type: 'step',
            user_id: userId
        });

        await webpush.sendNotification(subscription, payload);

        // 送信ログを記録
        await supabaseAdmin
            .from('step_notification_logs')
            .insert({
                user_id: userId,
                sequence_id: sequenceId,
                step_notification_id: stepNotification.id,
                step_order: 1,
                success: true
            });

        // 次のステップがあるか確認して進捗を更新
        const { data: nextStep, error: nextStepError } = await supabaseAdmin
            .from('step_notifications')
            .select('*')
            .eq('sequence_id', sequenceId)
            .eq('step_order', 2)
            .single();

        if (nextStepError || !nextStep) {
            await supabaseAdmin
                .from('user_step_progress')
                .update({
                    current_step: 1,
                    completed: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', progressId);
        } else {
            const nextNotificationAt = calculateNextNotificationTime(nextStep);
            await supabaseAdmin
                .from('user_step_progress')
                .update({
                    current_step: 1,
                    next_notification_at: nextNotificationAt,
                    updated_at: new Date().toISOString()
                })
                .eq('id', progressId);
        }

        console.log(`[Register] Sent immediate step 1 to user ${userId}`);
    } catch (err) {
        console.error(`[Register] Failed to send immediate step to user ${userId}:`, err);
        // 失敗時はログのみ記録、進捗はCronに任せる（next_notification_at=nowのまま）
        try {
            await supabaseAdmin
                .from('step_notification_logs')
                .insert({
                    user_id: userId,
                    sequence_id: sequenceId,
                    step_notification_id: stepNotification.id,
                    step_order: 1,
                    success: false,
                    error_message: err.message || 'Unknown error'
                });
        } catch (logErr) {
            console.error('[Register] Failed to log error:', logErr);
        }
    }
}

/**
 * ステップの配信タイミング設定から次の配信時刻を計算
 */
function calculateNextNotificationTime(step) {
    const now = new Date();
    const delayValue = Number(step.delay_value) || 0;

    switch (step.delay_type) {
        case 'immediate':
            return now.toISOString();
        
        case 'minutes':
            now.setMinutes(now.getMinutes() + delayValue);
            return now.toISOString();
        
        case 'hours':
            now.setTime(now.getTime() + delayValue * 60 * 60 * 1000);
            return now.toISOString();
        
        case 'days':
            now.setTime(now.getTime() + delayValue * 24 * 60 * 60 * 1000);
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
