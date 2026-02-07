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
        // ステップ配信シーケンスを取得
        const { data: sequences, error: seqError } = await supabaseAdmin
            .from('step_sequences')
            .select('*')
            .order('created_at', { ascending: false });

        if (seqError) throw seqError;

        // 各シーケンスのステップを取得
        const sequencesWithSteps = await Promise.all(
            sequences.map(async (seq) => {
                const { data: steps, error: stepsError } = await supabaseAdmin
                    .from('step_notifications')
                    .select('*')
                    .eq('sequence_id', seq.id)
                    .order('step_order', { ascending: true });

                if (stepsError) {
                    console.error('Steps fetch error:', stepsError);
                    return { ...seq, steps: [] };
                }

                return { ...seq, steps };
            })
        );

        return res.status(200).json({
            status: 'ok',
            data: sequencesWithSteps
        });
    } catch (err) {
        console.error('List error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
