import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// テナント管理API統合版（?action=list|create|update|get）
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
        } else if (action === 'get') {
            return await handleGet(req, res);
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid action parameter' });
        }
    } catch (err) {
        console.error('Tenants error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function handleList(req, res) {
    const { data: tenants } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

    // 各テナントの統計情報を取得
    const tenantsWithStats = await Promise.all(
        (tenants || []).map(async (tenant) => {
            const { count: userCount } = await supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);

            const { count: notificationCount } = await supabaseAdmin
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .eq('sent', true);

            const { count: pendingTaskCount } = await supabaseAdmin
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .in('status', ['pending', 'in_progress']);

            return {
                ...tenant,
                stats: {
                    user_count: userCount || 0,
                    notification_count: notificationCount || 0,
                    pending_task_count: pendingTaskCount || 0
                }
            };
        })
    );

    return res.status(200).json({
        status: 'ok',
        data: tenantsWithStats
    });
}

async function handleCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { name, plan, monthly_limit, monthly_fee, contract_start_date, contract_end_date } = req.body;

    if (!name || !plan) {
        return res.status(400).json({
            status: 'error',
            message: 'name and plan are required'
        });
    }

    const planLimits = {
        basic: 10000,
        pro: 100000,
        enterprise: 999999999
    };

    const planFees = {
        basic: 100000,
        pro: 250000,
        enterprise: 500000
    };

    const { data } = await supabaseAdmin
        .from('tenants')
        .insert({
            name,
            plan,
            monthly_limit: monthly_limit || planLimits[plan] || 10000,
            monthly_fee: monthly_fee || planFees[plan] || 100000,
            contract_start_date: contract_start_date || new Date().toISOString().split('T')[0],
            contract_end_date: contract_end_date || null,
            status: 'active'
        })
        .select()
        .single();

    return res.status(200).json({
        status: 'ok',
        message: 'Tenant created',
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
        .from('tenants')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

    return res.status(200).json({
        status: 'ok',
        message: 'Tenant updated',
        data
    });
}

async function handleGet(req, res) {
    const tenantId = req.query.id || req.query.tenant_id;

    if (!tenantId) {
        return res.status(400).json({
            status: 'error',
            message: 'id or tenant_id is required'
        });
    }

    const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

    if (!tenant) {
        return res.status(404).json({
            status: 'error',
            message: 'Tenant not found'
        });
    }

    // 統計情報を取得
    const { count: userCount } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

    const { count: notificationCount } = await supabaseAdmin
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('sent', true);

    const { count: pendingTaskCount } = await supabaseAdmin
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .in('status', ['pending', 'in_progress']);

    return res.status(200).json({
        status: 'ok',
        data: {
            ...tenant,
            stats: {
                user_count: userCount || 0,
                notification_count: notificationCount || 0,
                pending_task_count: pendingTaskCount || 0
            }
        }
    });
}
