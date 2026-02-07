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
        const subscriptionJson = JSON.stringify(subscription);
        
        const { error } = await supabaseAdmin
            .from('users')
            .upsert(
                { 
                    fcm_token: subscriptionJson // サブスクリプションJSON全体を保存
                }, 
                { onConflict: 'fcm_token' }
            );

        if (error) throw error;

        return res.status(200).json({ status: 'ok', message: 'Subscription registered' });
    } catch (err) {
        console.error('Subscription registration error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
