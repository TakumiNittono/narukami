import { createClient } from '@supabase/supabase-js';

// 環境変数の確認
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Supabase] Missing environment variables!');
    console.error('[Supabase] SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Missing');
    console.error('[Supabase] SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');
}

// サーバーサイド用（service_role key → RLSバイパス）
export const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
