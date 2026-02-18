import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    const adminUser = await verifyAdmin(req);
    if (!adminUser) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    const action = req.query.action || (req.method === 'GET' ? 'list' : 'create');

    try {
        if (action === 'list')     return await handleList(req, res);
        if (action === 'create')   return await handleCreate(req, res);
        if (action === 'complete') return await handleComplete(req, res);
        return res.status(400).json({ status: 'error', message: 'Invalid action' });
    } catch (err) {
        console.error('Tasks error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function handleList(req, res) {
    const tenantId = req.query.tenant_id;

    let query = supabaseAdmin
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data: tasks, error } = await query;
    if (error) throw error;

    // tenant_name をマッピング
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id, name');
    const tenantMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name]));

    const tasksWithName = (tasks || []).map(t => ({
        ...t,
        tenant_name: tenantMap[t.tenant_id] || '-'
    }));

    return res.status(200).json({ status: 'ok', data: tasksWithName });
}

async function handleCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { tenant_id, task_type, title, description, priority, due_date } = req.body;

    if (!tenant_id || !task_type || !title) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, task_type, and title are required' });
    }

    const { data, error } = await supabaseAdmin
        .from('tasks')
        .insert({
            tenant_id: parseInt(tenant_id),
            task_type,
            title,
            description: description || '',
            priority: priority || 'normal',
            due_date: due_date || null,
            status: 'pending'
        })
        .select();

    if (error) throw error;

    return res.status(200).json({ status: 'ok', message: 'Task created', data: data[0] });
}

async function handleComplete(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { task_id } = req.body;
    if (!task_id) {
        return res.status(400).json({ status: 'error', message: 'task_id is required' });
    }

    const { data, error } = await supabaseAdmin
        .from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task_id)
        .select();

    if (error) throw error;

    return res.status(200).json({ status: 'ok', message: 'Task completed', data: data[0] });
}
