import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        // ステップ配信の進捗状況を取得
        const { data: progress, error: progressError } = await supabaseAdmin
            .from('user_step_progress')
            .select(`
                id,
                user_id,
                sequence_id,
                current_step,
                next_notification_at,
                completed,
                created_at,
                step_sequences!inner(name, is_active),
                users!inner(id)
            `)
            .eq('completed', false)
            .order('next_notification_at', { ascending: true });

        if (progressError) throw progressError;

        // 配信予定時刻を過ぎたもの
        const now = new Date().toISOString();
        const overdue = progress?.filter(p => p.next_notification_at <= now) || [];
        const upcoming = progress?.filter(p => p.next_notification_at > now) || [];

        // 統計情報
        const stats = {
            total: progress?.length || 0,
            overdue: overdue.length,
            upcoming: upcoming.length,
            completed: 0
        };

        // 完了済みの数も取得
        const { count: completedCount } = await supabaseAdmin
            .from('user_step_progress')
            .select('*', { count: 'exact', head: true })
            .eq('completed', true);

        stats.completed = completedCount || 0;

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
    } catch (err) {
        console.error('Status check error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
