import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { title, body, url, send_at } = req.body;

    // バリデーション
    if (!title || !body || !send_at) {
        return res.status(400).json({
            status: 'error',
            message: 'title, body, send_at are required'
        });
    }

    if (title.length > 100) {
        return res.status(400).json({ status: 'error', message: 'Title too long (max 100)' });
    }

    if (body.length > 500) {
        return res.status(400).json({ status: 'error', message: 'Body too long (max 500)' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('notifications')
            .insert({
                title,
                body,
                url: url || '',
                send_at: new Date(send_at).toISOString(),
            })
            .select();

        if (error) throw error;

        return res.status(200).json({ status: 'ok', message: 'Notification created', data });
    } catch (err) {
        console.error('Create error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
