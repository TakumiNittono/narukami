import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { id } = req.body;

    if (!id) {
        return res.status(400).json({
            status: 'error',
            message: 'id is required'
        });
    }

    try {
        // CASCADE制約により、step_notificationsとuser_step_progressも自動削除される
        const { error } = await supabaseAdmin
            .from('step_sequences')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return res.status(200).json({
            status: 'ok',
            message: 'Sequence deleted'
        });
    } catch (err) {
        console.error('Delete error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
