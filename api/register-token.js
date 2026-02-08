import { supabaseAdmin } from '../lib/supabase.js';

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

    const { subscription } = req.body;

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
        // サブスクリプション情報をJSON文字列として保存
        // fcm_tokenカラムにサブスクリプションJSON全体を保存
        // endpointはユニークなので、同じendpointの場合は上書きされる
        const subscriptionJson = JSON.stringify(subscription);
        
        // 既存のendpointをチェックして、存在する場合は更新、存在しない場合は挿入
        // 全ユーザーを取得してJavaScriptでフィルタリング（LIKEクエリのエスケープ問題を回避）
        const { data: allUsers, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('id, fcm_token');
        
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
            // 既存のレコードを更新
            const { error } = await supabaseAdmin
                .from('users')
                .update({ fcm_token: subscriptionJson })
                .eq('id', existing.id);
            
            if (error) throw error;
            userId = existing.id;
        } else {
            // 新規レコードを挿入
            const { data: newUser, error } = await supabaseAdmin
                .from('users')
                .insert({ fcm_token: subscriptionJson })
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

        // 新規ユーザーの場合、有効なステップ配信シーケンスに登録
        if (isNewUser && userId) {
            await enrollUserInStepSequences(userId);
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
 * 新規ユーザーを有効なステップ配信シーケンスに登録する
 */
async function enrollUserInStepSequences(userId, tenantId) {
    try {
        // 有効なシーケンスを取得（テナントIDでフィルタリング）
        let seqQuery = supabaseAdmin
            .from('step_sequences')
            .select('id')
            .eq('is_active', true);
        
        if (tenantId) {
            seqQuery = seqQuery.eq('tenant_id', tenantId);
        }
        
        const { data: activeSequences, error: seqError } = await seqQuery;

        if (seqError) {
            console.error('Failed to fetch active sequences:', seqError);
            return;
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
            const { error: progressError } = await supabaseAdmin
                .from('user_step_progress')
                .insert({
                    user_id: userId,
                    sequence_id: sequence.id,
                    current_step: 0, // 0 = 未開始
                    next_notification_at: nextNotificationAt
                });

            if (progressError) {
                console.error(`Failed to create progress for sequence ${sequence.id}:`, progressError);
            }
        }
    } catch (err) {
        console.error('Failed to enroll user in step sequences:', err);
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
