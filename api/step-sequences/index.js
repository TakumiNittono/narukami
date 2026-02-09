import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// ステップ配信API統合版（?action=list|create|toggle|delete|status）
export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const action = req.query.action || (req.method === 'GET' ? 'list' : req.body.id ? (req.body.is_active !== undefined ? 'toggle' : 'delete') : 'create');

    try {
        if (action === 'list') {
            return await handleList(req, res);
        } else if (action === 'create') {
            return await handleCreate(req, res);
        } else if (action === 'toggle') {
            return await handleToggle(req, res);
        } else if (action === 'delete') {
            return await handleDelete(req, res);
        } else if (action === 'status') {
            return await handleStatus(req, res);
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid action parameter' });
        }
    } catch (err) {
        console.error('Step sequences error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function handleList(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const tenantId = req.query.tenant_id ? parseInt(req.query.tenant_id) : null;
    
    let sequencesQuery = supabaseAdmin
        .from('step_sequences')
        .select('*')
        .order('created_at', { ascending: false });
    
    // tenant_idでフィルタリング（指定されている場合）
    // tenant_idがnullのシーケンスも表示される（既存データ対応）
    if (tenantId !== null && !isNaN(tenantId)) {
        sequencesQuery = sequencesQuery.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    }
    
    const { data: sequences, error: sequencesError } = await sequencesQuery;
    
    if (sequencesError) {
        console.error('Step sequences query error:', sequencesError);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch sequences' });
    }

    const sequencesWithSteps = await Promise.all(
        sequences.map(async (seq) => {
            const { data: steps } = await supabaseAdmin
                .from('step_notifications')
                .select('*')
                .eq('sequence_id', seq.id)
                .order('step_order', { ascending: true });

            return { ...seq, steps: steps || [] };
        })
    );

    return res.status(200).json({
        status: 'ok',
        data: sequencesWithSteps
    });
}

async function handleCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { name, description, is_active, steps, tenant_id } = req.body;

    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
        return res.status(400).json({
            status: 'error',
            message: 'name and steps (array) are required'
        });
    }

    if (name.length > 200) {
        return res.status(400).json({ status: 'error', message: 'Name too long (max 200)' });
    }

    for (const step of steps) {
        if (!step.title || !step.body || !step.delay_type || step.step_order === undefined) {
            return res.status(400).json({
                status: 'error',
                message: 'Each step must have title, body, delay_type, and step_order'
            });
        }

        if (step.title.length > 100 || step.body.length > 500) {
            return res.status(400).json({ status: 'error', message: 'Step title/body too long' });
        }

        const validDelayTypes = ['immediate', 'minutes', 'hours', 'days', 'scheduled'];
        if (!validDelayTypes.includes(step.delay_type)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid delay_type'
            });
        }

        if (step.delay_type === 'scheduled' && !step.scheduled_time) {
            return res.status(400).json({
                status: 'error',
                message: 'scheduled_time is required when delay_type is "scheduled"'
            });
        }
    }

    const insertData = {
        name,
        description: description || '',
        is_active: is_active !== undefined ? is_active : true
    };
    
    if (tenant_id) {
        insertData.tenant_id = tenant_id;
    }
    
    const { data: sequence } = await supabaseAdmin
        .from('step_sequences')
        .insert(insertData)
        .select()
        .single();

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
}

async function handleToggle(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { id, is_active } = req.body;

    if (!id || is_active === undefined) {
        return res.status(400).json({
            status: 'error',
            message: 'id and is_active are required'
        });
    }

    const { data } = await supabaseAdmin
        .from('step_sequences')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();

    return res.status(200).json({
        status: 'ok',
        message: 'Sequence updated',
        data
    });
}

async function handleDelete(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { id } = req.body;

    if (!id) {
        return res.status(400).json({
            status: 'error',
            message: 'id is required'
        });
    }

    await supabaseAdmin
        .from('step_sequences')
        .delete()
        .eq('id', id);

    return res.status(200).json({
        status: 'ok',
        message: 'Sequence deleted'
    });
}

async function handleStatus(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const tenantId = req.query.tenant_id ? parseInt(req.query.tenant_id) : null;
    
    let progressQuery = supabaseAdmin
        .from('user_step_progress')
        .select(`
            id,
            user_id,
            sequence_id,
            current_step,
            next_notification_at,
            completed,
            created_at,
            step_sequences!inner(name, is_active, tenant_id),
            users!inner(id, tenant_id)
        `)
        .eq('completed', false);
    
    const { data: allProgress } = await progressQuery
        .order('next_notification_at', { ascending: true });
    
    // tenant_idでフィルタリング（指定されている場合、JavaScriptでフィルタリング）
    const progress = tenantId 
        ? (allProgress || []).filter(p => p.users?.tenant_id === tenantId)
        : (allProgress || []);

    const now = new Date().toISOString();
    const overdue = progress?.filter(p => p.next_notification_at <= now) || [];
    const upcoming = progress?.filter(p => p.next_notification_at > now) || [];

    const { count: completedCount } = await supabaseAdmin
        .from('user_step_progress')
        .select('*', { count: 'exact', head: true })
        .eq('completed', true);

    const stats = {
        total: progress?.length || 0,
        overdue: overdue.length,
        upcoming: upcoming.length,
        completed: completedCount || 0
    };

    return res.status(200).json({
        status: 'ok',
        data: {
            stats,
            overdue: overdue.map(p => ({
                id: p.id,
                user_id: p.user_id,
                sequence_name: p.step_sequences.name,
                current_step: p.current_step,
                next_notification_at: p.next_notification_at
            })),
            upcoming: upcoming.slice(0, 10).map(p => ({
                id: p.id,
                user_id: p.user_id,
                sequence_name: p.step_sequences.name,
                current_step: p.current_step,
                next_notification_at: p.next_notification_at
            }))
        }
    });
}
