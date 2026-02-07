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

    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ status: 'error', message: 'Subscription is required' });
    }

    try {
        // サブスクリプション情報をJSON文字列として保存
        // fcm_tokenカラムにサブスクリプションJSON全体を保存
        // endpointはユニークなので、同じendpointの場合は上書きされる
        const subscriptionJson = JSON.stringify(subscription);
        
        // 既存のendpointをチェックして、存在する場合は更新、存在しない場合は挿入
        const { data: existing } = await supabaseAdmin
            .from('users')
            .select('fcm_token')
            .like('fcm_token', `%"endpoint":"${subscription.endpoint}"%`)
            .limit(1);
        
        if (existing && existing.length > 0) {
            // 既存のレコードを更新
            const { error } = await supabaseAdmin
                .from('users')
                .update({ fcm_token: subscriptionJson })
                .eq('fcm_token', existing[0].fcm_token);
            
            if (error) throw error;
        } else {
            // 新規レコードを挿入
            const { error } = await supabaseAdmin
                .from('users')
                .insert({ fcm_token: subscriptionJson });
            
            if (error) {
                // UNIQUE制約違反の場合は更新を試みる
                if (error.code === '23505') {
                    const { error: updateError } = await supabaseAdmin
                        .from('users')
                        .update({ fcm_token: subscriptionJson })
                        .eq('fcm_token', subscriptionJson);
                    
                    if (updateError) throw updateError;
                } else {
                    throw error;
                }
            }
        }

        return res.status(200).json({ status: 'ok', message: 'Subscription registered' });
    } catch (err) {
        console.error('Subscription registration error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
