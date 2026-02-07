import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { name, description, is_active, steps } = req.body;

    // バリデーション
    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
        return res.status(400).json({
            status: 'error',
            message: 'name and steps (array) are required'
        });
    }

    if (name.length > 200) {
        return res.status(400).json({ status: 'error', message: 'Name too long (max 200)' });
    }

    // ステップのバリデーション
    for (const step of steps) {
        if (!step.title || !step.body || !step.delay_type || step.step_order === undefined) {
            return res.status(400).json({
                status: 'error',
                message: 'Each step must have title, body, delay_type, and step_order'
            });
        }

        if (step.title.length > 100) {
            return res.status(400).json({ status: 'error', message: 'Step title too long (max 100)' });
        }

        if (step.body.length > 500) {
            return res.status(400).json({ status: 'error', message: 'Step body too long (max 500)' });
        }

        const validDelayTypes = ['immediate', 'minutes', 'hours', 'days', 'scheduled'];
        if (!validDelayTypes.includes(step.delay_type)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid delay_type. Must be one of: ' + validDelayTypes.join(', ')
            });
        }

        if (step.delay_type === 'scheduled' && !step.scheduled_time) {
            return res.status(400).json({
                status: 'error',
                message: 'scheduled_time is required when delay_type is "scheduled"'
            });
        }
    }

    try {
        // トランザクション風処理: シーケンス作成 → ステップ作成
        const { data: sequence, error: seqError } = await supabaseAdmin
            .from('step_sequences')
            .insert({
                name,
                description: description || '',
                is_active: is_active !== undefined ? is_active : true
            })
            .select()
            .single();

        if (seqError) throw seqError;

        // ステップを挿入
        const stepsToInsert = steps.map(step => ({
            sequence_id: sequence.id,
            step_order: step.step_order,
            title: step.title,
            body: step.body,
            url: step.url || '',
            delay_type: step.delay_type,
            delay_value: step.delay_value || 0,
            scheduled_time: step.scheduled_time || null
        }));

        const { data: insertedSteps, error: stepsError } = await supabaseAdmin
            .from('step_notifications')
            .insert(stepsToInsert)
            .select();

        if (stepsError) {
            // ステップ挿入失敗時はシーケンスも削除（ロールバック風）
            await supabaseAdmin.from('step_sequences').delete().eq('id', sequence.id);
            throw stepsError;
        }

        return res.status(200).json({
            status: 'ok',
            message: 'Step sequence created',
            data: {
                sequence,
                steps: insertedSteps
            }
        });
    } catch (err) {
        console.error('Create error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
