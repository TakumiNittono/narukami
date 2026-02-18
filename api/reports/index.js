import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    const adminUser = await verifyAdmin(req);
    if (!adminUser) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    const action = req.query.action || (req.method === 'GET' ? 'list' : 'create');

    try {
        if (action === 'list')   return await handleList(req, res);
        if (action === 'create') return await handleCreate(req, res);
        return res.status(400).json({ status: 'error', message: 'Invalid action' });
    } catch (err) {
        console.error('Reports error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function handleList(req, res) {
    const tenantId = req.query.tenant_id;

    let query = supabaseAdmin
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data: reports, error } = await query;
    if (error) throw error;

    // tenant_name をマッピング
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id, name');
    const tenantMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name]));

    const reportsWithName = (reports || []).map(r => ({
        ...r,
        tenant_name: tenantMap[r.tenant_id] || '-'
    }));

    return res.status(200).json({ status: 'ok', data: reportsWithName });
}

async function handleCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { tenant_id, report_type, period_start, period_end, title, summary } = req.body;

    if (!tenant_id || !period_start || !period_end || !title) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, period_start, period_end, and title are required' });
    }

    const { data, error } = await supabaseAdmin
        .from('reports')
        .insert({
            tenant_id: parseInt(tenant_id),
            report_type: report_type || 'monthly',
            period_start,
            period_end,
            title,
            summary: summary || ''
        })
        .select();

    if (error) throw error;

    return res.status(200).json({ status: 'ok', message: 'Report created', data: data[0] });
}
