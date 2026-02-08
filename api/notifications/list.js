import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const tenantId = req.query.tenant_id;

        let query = supabaseAdmin
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });

        // テナントIDでフィルタリング（フルマネージド対応）
        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: 'ok', data });
    } catch (err) {
        console.error('List error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
