import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    const adminUser = await verifyAdmin(req);
    if (!adminUser) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    const action = req.query.action || (req.method === 'GET' ? 'list' : 'create');

    try {
        if (action === 'list')   return await handleList(req, res);
        if (action === 'create') return await handleCreate(req, res);
        if (action === 'stats')  return await handleStats(req, res);
        return res.status(400).json({ status: 'error', message: 'Invalid action' });
    } catch (err) {
        console.error('Tenants error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function handleList(req, res) {
    const { data: tenants, error } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;

    // 各テナントのuser_count / notification_count / pending_task_count を付与
    const tenantsWithStats = await Promise.all((tenants || []).map(async (tenant) => {
        const [userRes, notifRes, taskRes] = await Promise.all([
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
            supabaseAdmin.from('notifications').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('sent', true),
            supabaseAdmin.from('tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).in('status', ['pending', 'in_progress'])
        ]);
        return {
            ...tenant,
            stats: {
                user_count: userRes.count || 0,
                notification_count: notifRes.count || 0,
                pending_task_count: taskRes.count || 0
            }
        };
    }));

    return res.status(200).json({ status: 'ok', data: tenantsWithStats });
}

async function handleCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { name, plan, monthly_limit, contract_start_date, contract_end_date } = req.body;

    if (!name || !plan) {
        return res.status(400).json({ status: 'error', message: 'name and plan are required' });
    }

    const { data, error } = await supabaseAdmin
        .from('tenants')
        .insert({
            name,
            plan,
            monthly_limit: monthly_limit ? parseInt(monthly_limit) : 10000,
            contract_start_date: contract_start_date || null,
            contract_end_date: contract_end_date || null,
            status: 'active'
        })
        .select();

    if (error) throw error;

    return res.status(200).json({ status: 'ok', message: 'Tenant created', data: data[0] });
}

async function handleStats(req, res) {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [tenantsRes, activeRes, tasksRes, sentRes] = await Promise.all([
        supabaseAdmin.from('tenants').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabaseAdmin.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
        supabaseAdmin.from('notifications').select('*', { count: 'exact', head: true }).eq('sent', true).gte('send_at', firstOfMonth)
    ]);

    return res.status(200).json({
        status: 'ok',
        data: {
            total_tenants: tenantsRes.count || 0,
            active_tenants: activeRes.count || 0,
            pending_tasks: tasksRes.count || 0,
            monthly_sent: sentRes.count || 0
        }
    });
}
