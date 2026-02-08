import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

// セグメント一覧を取得するAPI
export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const { data: segments, error } = await supabaseAdmin
            .from('user_segments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 各セグメントのユーザー数を計算（簡易実装）
        // 実際にはfilter_conditionsに基づいて計算する必要がある
        const segmentsWithCount = await Promise.all(
            (segments || []).map(async (segment) => {
                // 簡易実装: 全ユーザー数を返す（実際にはフィルター条件を評価する必要がある）
                const { count } = await supabaseAdmin
                    .from('users')
                    .select('*', { count: 'exact', head: true });

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
    } catch (err) {
        console.error('Segments list error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
