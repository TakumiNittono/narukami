import { createClient } from '@supabase/supabase-js';

// サーバーサイド用（service_role key → RLSバイパス）
export const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
