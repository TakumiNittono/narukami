import { supabaseAdmin } from '../lib/supabase.js';
import { verifyAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const { count, error } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;

        return res.status(200).json({ status: 'ok', data: { user_count: count } });
    } catch (err) {
        console.error('Stats error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
