import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// セグメントAPI統合版（?action=list|create|preview）
export default async function handler(req, res) {
    const action = req.query.action || (req.method === 'GET' ? 'list' : req.method === 'POST' ? (req.body.segment_id || req.body.filter_conditions ? 'preview' : 'create') : 'list');

    const adminUser = await verifyAdmin(req);
    if (action !== 'preview' && !adminUser) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        if (action === 'list') {
            return await handleList(req, res);
        } else if (action === 'create') {
            return await handleCreate(req, res);
        } else if (action === 'preview') {
            if (!adminUser) {
                return res.status(401).json({ status: 'error', message: 'Unauthorized' });
            }
            return await handlePreview(req, res);
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid action parameter' });
        }
    } catch (err) {
        console.error('Segments error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

async function handleList(req, res) {
    const tenantId = req.query.tenant_id; // フルマネージド対応
    
    let segmentsQuery = supabaseAdmin
        .from('user_segments')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (tenantId) {
        segmentsQuery = segmentsQuery.eq('tenant_id', tenantId);
    }
    
    const { data: segments } = await segmentsQuery;

    const segmentsWithCount = await Promise.all(
        (segments || []).map(async (segment) => {
            let usersQuery = supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true });
            
            if (tenantId) {
                usersQuery = usersQuery.eq('tenant_id', tenantId);
            }
            
            const { count } = await usersQuery;

            return {
                ...segment,
                user_count: count || 0
            };
        })
    );

    return res.status(200).json({
        status: 'ok',
        data: segmentsWithCount
    });
}

async function handleCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { name, description, filter_conditions, is_dynamic = true, tenant_id } = req.body;

    if (!name || !filter_conditions) {
        return res.status(400).json({
            status: 'error',
            message: 'name and filter_conditions are required'
        });
    }

    // filter_conditions の構造バリデーション
    if (typeof filter_conditions !== 'object' || filter_conditions === null) {
        return res.status(400).json({ status: 'error', message: 'filter_conditions must be an object' });
    }
    if (filter_conditions.conditions && !Array.isArray(filter_conditions.conditions)) {
        return res.status(400).json({ status: 'error', message: 'filter_conditions.conditions must be an array' });
    }
    if (filter_conditions.conditions) {
        const validFields = ['registered_days_ago', 'device_type', 'browser', 'has_tag'];
        const validOps = ['eq', 'gte', 'lte', 'in'];
        for (const c of filter_conditions.conditions) {
            if (!c.field || !c.operator) {
                return res.status(400).json({ status: 'error', message: 'Each condition must have field and operator' });
            }
            if (!validFields.includes(c.field)) {
                return res.status(400).json({ status: 'error', message: `Invalid field: ${c.field}` });
            }
            if (!validOps.includes(c.operator)) {
                return res.status(400).json({ status: 'error', message: `Invalid operator: ${c.operator}` });
            }
        }
    }

    const { data, error } = await supabaseAdmin
        .from('user_segments')
        .insert({
            name,
            description: description || '',
            filter_conditions,
            is_dynamic: is_dynamic !== undefined ? is_dynamic : true,
            tenant_id: tenant_id || null
        })
        .select();

    if (error) {
        if (error.code === '23505') {
            return res.status(400).json({
                status: 'error',
                message: 'Segment name already exists'
            });
        }
        throw error;
    }

    return res.status(200).json({
        status: 'ok',
        message: 'Segment created',
        data: data[0]
    });
}

async function handlePreview(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { filter_conditions, segment_id, tenant_id } = req.body;

    let query = supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
    
    // テナントIDでフィルタリング
    if (tenant_id) {
        query = query.eq('tenant_id', tenant_id);
    }

    if (segment_id) {
        let segmentQuery = supabaseAdmin
            .from('user_segments')
            .select('filter_conditions')
            .eq('id', segment_id);
        
        if (tenant_id) {
            segmentQuery = segmentQuery.eq('tenant_id', tenant_id);
        }
        
        const { data: segment } = await segmentQuery.single();

        if (!segment) {
            return res.status(404).json({ status: 'error', message: 'Segment not found' });
        }

        query = applyFilterConditions(query, segment.filter_conditions);
    } else if (filter_conditions) {
        query = applyFilterConditions(query, filter_conditions);
    }

    const { count } = await query;

    return res.status(200).json({
        status: 'ok',
        data: {
            user_count: count || 0
        }
    });
}

function applyFilterConditions(query, conditions) {
    if (!conditions || !conditions.conditions || !Array.isArray(conditions.conditions)) {
        return query;
    }

    conditions.conditions.forEach(condition => {
        const { field, operator: op, value } = condition;

        switch (field) {
            case 'registered_days_ago':
                if (op === 'gte') {
                    const date = new Date();
                    date.setDate(date.getDate() - value);
                    query = query.gte('created_at', date.toISOString());
                } else if (op === 'lte') {
                    const date = new Date();
                    date.setDate(date.getDate() - value);
                    query = query.lte('created_at', date.toISOString());
                }
                break;

            case 'device_type':
                if (op === 'eq') {
                    query = query.eq('device_type', value);
                } else if (op === 'in' && Array.isArray(value)) {
                    query = query.in('device_type', value);
                }
                break;

            case 'browser':
                if (op === 'eq') {
                    query = query.eq('browser', value);
                } else if (op === 'in' && Array.isArray(value)) {
                    query = query.in('browser', value);
                }
                break;

            case 'engagement_level':
                if (op === 'eq' && value === 'active') {
                    query = query.gte('engagement_score', 50);
                } else if (op === 'eq' && value === 'inactive') {
                    query = query.lt('engagement_score', 50);
                }
                break;
        }
    });

    return query;
}
