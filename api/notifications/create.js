import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { 
        title, 
        body, 
        url, 
        send_at, 
        target_type = 'all', 
        target_segment_id, 
        target_filter 
    } = req.body;

    // バリデーション
    if (!title || !body || !send_at) {
        return res.status(400).json({
            status: 'error',
            message: 'title, body, send_at are required'
        });
    }

    if (title.length > 100) {
        return res.status(400).json({ status: 'error', message: 'Title too long (max 100)' });
    }

    if (body.length > 500) {
        return res.status(400).json({ status: 'error', message: 'Body too long (max 500)' });
    }

    try {
        const tenantId = req.body.tenant_id; // フルマネージド対応

        // 送信対象ユーザー数を計算
        let targetUserCount = 0;
        let userQuery = supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
        
        // テナントIDでフィルタリング
        if (tenantId) {
            userQuery = userQuery.eq('tenant_id', tenantId);
        }
        
        if (target_type === 'all') {
            const { count } = await userQuery;
            targetUserCount = count || 0;
        } else if (target_type === 'segment' && target_segment_id) {
            // セグメントのユーザー数を取得
            let segmentQuery = supabaseAdmin
                .from('user_segments')
                .select('filter_conditions')
                .eq('id', target_segment_id);
            
            if (tenantId) {
                segmentQuery = segmentQuery.eq('tenant_id', tenantId);
            }
            
            const { data: segment } = await segmentQuery.single();
            
            if (segment) {
                targetUserCount = await getFilteredUserCount(segment.filter_conditions, tenantId);
            }
        } else if (target_type === 'custom_filter' && target_filter) {
            targetUserCount = await getFilteredUserCount(target_filter, tenantId);
        }

        const { data, error } = await supabaseAdmin
            .from('notifications')
            .insert({
                title,
                body,
                url: url || '',
                send_at: new Date(send_at).toISOString(),
                target_type,
                target_segment_id: target_segment_id || null,
                target_filter: target_filter || null,
                target_user_count: targetUserCount,
                status: 'scheduled',
                tenant_id: tenantId || null // フルマネージド対応
            })
            .select();

        if (error) throw error;

        return res.status(200).json({ 
            status: 'ok', 
            message: 'Notification created', 
            data: {
                ...data[0],
                target_user_count: targetUserCount
            }
        });
    } catch (err) {
        console.error('Create error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

// フィルター条件に基づいてユーザー数を取得するヘルパー関数
async function getFilteredUserCount(filterConditions, tenantId) {
    let query = supabaseAdmin.from('users').select('*', { count: 'exact', head: true });

    // テナントIDでフィルタリング
    if (tenantId) {
        query = query.eq('tenant_id', tenantId);
    }

    if (!filterConditions || !filterConditions.conditions || !Array.isArray(filterConditions.conditions)) {
        // フィルター条件がない場合は全ユーザー数
        const { count } = await query;
        return count || 0;
    }

    // フィルター条件を適用
    filterConditions.conditions.forEach(condition => {
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
        }
    });

    const { count } = await query;
    return count || 0;
}
}
