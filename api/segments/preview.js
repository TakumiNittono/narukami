import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// フィルター条件に該当するユーザー数を返すAPI
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { filter_conditions, segment_id } = req.body;

    try {
        let query = supabaseAdmin.from('users').select('*', { count: 'exact', head: true });

        // セグメントIDが指定されている場合はセグメントの条件を使用
        if (segment_id) {
            const { data: segment, error: segError } = await supabaseAdmin
                .from('user_segments')
                .select('filter_conditions')
                .eq('id', segment_id)
                .single();

            if (segError) throw segError;
            if (!segment) {
                return res.status(404).json({ status: 'error', message: 'Segment not found' });
            }

            query = applyFilterConditions(query, segment.filter_conditions);
        } else if (filter_conditions) {
            query = applyFilterConditions(query, filter_conditions);
        }

        const { count, error } = await query;

        if (error) throw error;

        return res.status(200).json({
            status: 'ok',
            data: {
                user_count: count || 0
            }
        });
    } catch (err) {
        console.error('Segment preview error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}

// フィルター条件を適用するヘルパー関数
function applyFilterConditions(query, conditions) {
    if (!conditions || !conditions.conditions || !Array.isArray(conditions.conditions)) {
        return query;
    }

    const operator = conditions.operator || 'AND';

    conditions.conditions.forEach(condition => {
        const { field, operator: op, value } = condition;

        switch (field) {
            case 'registered_days_ago':
                // 登録からの日数
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

            case 'has_tag':
                // タグを持つユーザー（サブクエリが必要）
                // 簡易実装: 現時点ではスキップ
                break;

            case 'engagement_level':
                // エンゲージメントレベル（簡易実装）
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
