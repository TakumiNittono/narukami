import { supabaseAdmin } from '../lib/supabase.js';
import { verifyAdmin } from '../lib/auth.js';

// stats API拡張版: ドメインベースでテナント情報を取得
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const adminUser = await verifyAdmin(req);
    if (!adminUser) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const domain = req.query.domain;
    const tenantId = req.query.tenant_id;

    try {
        // ドメインまたはtenant_idが指定されている場合、テナント情報を取得
        if (domain || tenantId) {
            let tenantQuery = supabaseAdmin.from('tenants').select('*');
            
            if (domain) {
                // ドメインからテナントを検索（tenant_domainsテーブルも確認）
                const { data: domainMapping } = await supabaseAdmin
                    .from('tenant_domains')
                    .select('tenant_id')
                    .eq('domain', domain)
                    .single();
                
                if (domainMapping) {
                    tenantQuery = tenantQuery.eq('id', domainMapping.tenant_id);
                } else {
                    // tenant_domainsテーブルがない場合、tenantsテーブルのdomainカラムを直接検索
                    tenantQuery = tenantQuery.eq('domain', domain);
                }
            } else if (tenantId) {
                tenantQuery = tenantQuery.eq('id', tenantId);
            }
            
            const { data: tenant, error: tenantError } = await tenantQuery.single();
            
            if (tenantError || !tenant) {
                return res.status(404).json({ 
                    status: 'error', 
                    message: 'Tenant not found' 
                });
            }
            
            // テナントの統計情報を取得
            const tenantIdNum = parseInt(tenant.id);
            console.log('Fetching stats for tenant_id:', tenantIdNum);
            
            const { count: userCount, error: userCountError } = await supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantIdNum);
            
            if (userCountError) {
                console.error('User count error:', userCountError);
            }
            
            console.log('User count for tenant:', tenantIdNum, '=', userCount);
            
            const { count: notificationCount, error: notificationCountError } = await supabaseAdmin
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantIdNum)
                .eq('sent', true);
            
            if (notificationCountError) {
                console.error('Notification count error:', notificationCountError);
            }
            
            console.log('Notification count for tenant:', tenantIdNum, '=', notificationCount);
            
            // 未対応タスク数（tasksテーブルが存在する場合）
            let pendingTaskCount = 0;
            try {
                const { count, error: taskCountError } = await supabaseAdmin
                    .from('tasks')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', tenantIdNum)
                    .in('status', ['pending', 'in_progress']);
                
                if (taskCountError) {
                    console.error('Task count error:', taskCountError);
                } else {
                    pendingTaskCount = count || 0;
                }
            } catch (e) {
                // tasksテーブルが存在しない場合は0
                console.log('Tasks table may not exist:', e.message);
            }
            
            console.log('Pending task count for tenant:', tenantIdNum, '=', pendingTaskCount);
            
            return res.status(200).json({
                status: 'ok',
                data: {
                    tenant: {
                        ...tenant,
                        stats: {
                            user_count: userCount || 0,
                            notification_count: notificationCount || 0,
                            pending_task_count: pendingTaskCount
                        }
                    }
                }
            });
        }
        
        // デフォルト: ユーザー数のみ（後方互換性）
        const { count, error } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;

        return res.status(200).json({ status: 'ok', data: { user_count: count } });
    } catch (err) {
        console.error('Stats error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
