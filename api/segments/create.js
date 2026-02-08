import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// セグメントを作成するAPI
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { name, description, filter_conditions, is_dynamic = true } = req.body;

    if (!name || !filter_conditions) {
        return res.status(400).json({
            status: 'error',
            message: 'name and filter_conditions are required'
        });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('user_segments')
            .insert({
                name,
                description: description || '',
                filter_conditions,
                is_dynamic: is_dynamic !== undefined ? is_dynamic : true
            })
            .select();

        if (error) throw error;

        return res.status(200).json({
            status: 'ok',
            message: 'Segment created',
            data: data[0]
        });
    } catch (err) {
        console.error('Segment create error:', err);
        if (err.code === '23505') { // Unique violation
            return res.status(400).json({
                status: 'error',
                message: 'Segment name already exists'
            });
        }
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
