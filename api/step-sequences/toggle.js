import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { id, is_active } = req.body;

    if (!id || is_active === undefined) {
        return res.status(400).json({
            status: 'error',
            message: 'id and is_active are required'
        });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('step_sequences')
            .update({ is_active, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();

        if (error) throw error;

        return res.status(200).json({
            status: 'ok',
            message: 'Sequence updated',
            data
        });
    } catch (err) {
        console.error('Toggle error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
