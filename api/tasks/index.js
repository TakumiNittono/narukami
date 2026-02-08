import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// タスク管理API統合版（?action=list|create|update|complete）
export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const action = req.query.action || (req.method === 'GET' ? 'list' : req.method === 'POST' ? (req.body.id ? 'update' : 'create') : 'list');

    try {
        if (action === 'list') {
            return await handleList(req, res);
        } else if (action === 'create') {
            return await handleCreate(req, res);
        } else if (action === 'update') {
            return await handleUpdate(req, res);
        } else if (action === 'complete') {
            return await handleComplete(req, res);
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid action parameter' });
        }
    } catch (err) {
        console.error('Tasks error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function handleList(req, res) {
    const tenantId = req.query.tenant_id;
    const status = req.query.status;

    let query = supabaseAdmin
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

    if (tenantId) {
        query = query.eq('tenant_id', tenantId);
    }

    if (status) {
        query = query.eq('status', status);
    }

    const { data: tasks } = await query;

    // テナント情報を取得
    const tenantIds = [...new Set(tasks.map(t => t.tenant_id))];
    const { data: tenants } = await supabaseAdmin
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds);

    const tenantMap = {};
    tenants.forEach(t => {
        tenantMap[t.id] = t.name;
    });

    const tasksWithTenant = tasks.map(task => ({
        ...task,
        tenant_name: tenantMap[task.tenant_id] || 'Unknown'
    }));

    return res.status(200).json({
        status: 'ok',
        data: tasksWithTenant
    });
}

async function handleCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { tenant_id, task_type, title, description, priority, due_date } = req.body;

    if (!tenant_id || !task_type || !title) {
        return res.status(400).json({
            status: 'error',
            message: 'tenant_id, task_type, and title are required'
        });
    }

    const { data } = await supabaseAdmin
        .from('tasks')
        .insert({
            tenant_id,
            task_type,
            title,
            description: description || '',
            priority: priority || 'normal',
            due_date: due_date || null,
            status: 'pending'
        })
        .select()
        .single();

    return res.status(200).json({
        status: 'ok',
        message: 'Task created',
        data
    });
}

async function handleUpdate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { id, ...updates } = req.body;

    if (!id) {
        return res.status(400).json({
            status: 'error',
            message: 'id is required'
        });
    }

    const { data } = await supabaseAdmin
        .from('tasks')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

    return res.status(200).json({
        status: 'ok',
        message: 'Task updated',
        data
    });
}

async function handleComplete(req, res) {
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

    const { data } = await supabaseAdmin
        .from('tasks')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

    return res.status(200).json({
        status: 'ok',
        message: 'Task completed',
        data
    });
}
