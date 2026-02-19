import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    // レスポンスヘッダーを確実に設定
    res.setHeader('Content-Type', 'application/json');
    
    try {
        // CORS対応
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            return res.status(200).end();
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ status: 'error', message: 'Method not allowed' });
        }

        // Supabase接続確認
        if (!supabaseAdmin) {
            console.error('[Create Notification] Supabase client is not initialized!');
            return res.status(500).json({ 
                status: 'error', 
                message: 'Database connection failed. Please check environment variables.' 
            });
        }

        // 環境変数確認
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('[Create Notification] Missing environment variables!');
            return res.status(500).json({ 
                status: 'error', 
                message: 'Server configuration error. Please contact administrator.' 
            });
        }

        const adminUser = await verifyAdmin(req);
        if (!adminUser) {
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

        // URLバリデーション（指定されている場合）
        if (url) {
            try {
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                    return res.status(400).json({ status: 'error', message: 'URL must use http or https protocol' });
                }
            } catch {
                return res.status(400).json({ status: 'error', message: 'Invalid URL format' });
            }
        }

        console.log('[Create Notification] Starting with data:', { title, body, send_at, target_type });
        const tenantId = req.body.tenant_id; // フルマネージド対応
        console.log('[Create Notification] Tenant ID:', tenantId);

        // 送信対象ユーザー数を計算
        let targetUserCount = 0;
        
        try {
            let userQuery = supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
            
            // テナントIDでフィルタリング
            if (tenantId) {
                userQuery = userQuery.eq('tenant_id', tenantId);
            }
            
            if (target_type === 'all') {
                console.log('[Create Notification] Counting all users...');
                const { count, error: countError } = await userQuery;
                if (countError) {
                    console.error('[Create Notification] Count error:', countError);
                    throw countError;
                }
                targetUserCount = count || 0;
                console.log('[Create Notification] Target user count:', targetUserCount);
            } else if (target_type === 'segment' && target_segment_id) {
                console.log('[Create Notification] Getting segment users...');
                // セグメントのユーザー数を取得
                let segmentQuery = supabaseAdmin
                    .from('user_segments')
                    .select('filter_conditions')
                    .eq('id', target_segment_id);
                
                if (tenantId) {
                    segmentQuery = segmentQuery.eq('tenant_id', tenantId);
                }
                
                const { data: segment, error: segmentError } = await segmentQuery.single();
                
                if (segmentError) {
                    console.error('[Create Notification] Segment error:', segmentError);
                    throw segmentError;
                }
                
                if (segment) {
                    targetUserCount = await getFilteredUserCount(segment.filter_conditions, tenantId);
                }
            } else if (target_type === 'custom_filter' && target_filter) {
                console.log('[Create Notification] Using custom filter...');
                targetUserCount = await getFilteredUserCount(target_filter, tenantId);
            }
        } catch (countErr) {
            console.error('[Create Notification] Error calculating user count:', countErr);
            throw countErr;
        }

        // send_atの日付形式を変換（YYYY/MM/DD HH:mm形式をISO形式に）
        let sendAtDate;
        try {
            console.log('[Create Notification] Parsing date:', send_at);
            // YYYY/MM/DD HH:mm形式を処理
            if (typeof send_at === 'string' && send_at.includes('/')) {
                const parts = send_at.trim().split(' ');
                if (parts.length < 1) {
                    throw new Error('Invalid date format');
                }
                
                const datePart = parts[0];
                const timePart = parts[1] || '00:00';
                
                const dateParts = datePart.split('/');
                if (dateParts.length !== 3) {
                    throw new Error('Invalid date format');
                }
                
                const [year, month, day] = dateParts.map(p => parseInt(p, 10));
                const timeParts = timePart.split(':');
                const hour = parseInt(timeParts[0] || '0', 10);
                const minute = parseInt(timeParts[1] || '0', 10);
                
                if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
                    throw new Error('Invalid date format');
                }
                
                sendAtDate = new Date(year, month - 1, day, hour, minute);
            } else {
                sendAtDate = new Date(send_at);
            }
            
            if (isNaN(sendAtDate.getTime())) {
                throw new Error('Invalid date format');
            }
            
            console.log('[Create Notification] Parsed date:', sendAtDate.toISOString());
        } catch (dateError) {
            console.error('[Create Notification] Date parsing error:', dateError);
            return res.status(400).json({
                status: 'error',
                message: `Invalid date format: ${dateError.message}. Please use YYYY/MM/DD HH:mm format`
            });
        }

        console.log('[Create Notification] Inserting notification...');
        // IPアドレスとUser-Agentから管理者を識別
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const adminIdentifier = `${clientIp}-${userAgent.substring(0, 50)}`.substring(0, 200);
        
        const { data, error } = await supabaseAdmin
            .from('notifications')
            .insert({
                title,
                body,
                url: url || '',
                send_at: sendAtDate.toISOString(),
                target_type,
                target_segment_id: target_segment_id || null,
                target_filter: target_filter || null,
                target_user_count: targetUserCount,
                status: 'scheduled',
                tenant_id: tenantId || null, // フルマネージド対応
                created_by: adminIdentifier,
                updated_by: adminIdentifier
            })
            .select();

        if (error) {
            console.error('[Create Notification] Supabase insert error:', error);
            throw error;
        }

        console.log('[Create Notification] Success! Notification ID:', data[0]?.id);
        return res.status(200).json({ 
            status: 'ok', 
            message: 'Notification created', 
            data: {
                ...data[0],
                target_user_count: targetUserCount
            }
        });
    } catch (err) {
        console.error('[Create Notification] Unhandled error:', err);
        console.error('[Create Notification] Error name:', err?.name);
        console.error('[Create Notification] Error message:', err?.message);
        console.error('[Create Notification] Error stack:', err?.stack);
        
        // エラーメッセージを安全に取得
        let errorMessage = 'Internal server error';
        if (err && typeof err === 'object') {
            if (err.message) {
                errorMessage = String(err.message);
            } else if (err.toString) {
                errorMessage = String(err.toString());
            }
        } else if (err) {
            errorMessage = String(err);
        }
        
        // エラーレスポンスを確実にJSON形式で返す
        // レスポンスが既に送信されている場合は何もしない
        if (!res.headersSent) {
            try {
                return res.status(500).json({ 
                    status: 'error', 
                    message: errorMessage,
                    error_type: err?.name || 'UnknownError',
                    details: process.env.NODE_ENV === 'development' ? (err?.stack || 'No stack trace') : undefined
                });
            } catch (jsonError) {
                // JSON送信に失敗した場合（非常に稀）
                console.error('[Create Notification] Failed to send JSON error response:', jsonError);
                // プレーンテキストで返す（最後の手段）
                try {
                    res.status(500).send(JSON.stringify({ 
                        status: 'error', 
                        message: errorMessage 
                    }));
                } catch (finalError) {
                    console.error('[Create Notification] Failed to send any response:', finalError);
                }
            }
        } else {
            console.error('[Create Notification] Response already sent, cannot send error response');
        }
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
