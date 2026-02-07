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

    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ status: 'error', message: 'Token is required' });
    }

    try {
        const { error } = await supabaseAdmin
            .from('users')
            .upsert({ fcm_token: token }, { onConflict: 'fcm_token' });

        if (error) throw error;

        return res.status(200).json({ status: 'ok', message: 'Token registered' });
    } catch (err) {
        console.error('Token registration error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
