import { supabaseAdmin } from './supabase.js';

/**
 * 管理者認証ミドルウェア（Supabase JWT + メールホワイトリスト）
 * Authorization: Bearer <supabase_access_token>
 * @returns {object|null} 認証済みユーザー or null
 */
export async function verifyAdmin(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;

    const token = authHeader.replace('Bearer ', '');
    if (!token) return null;

    // Supabase JWT検証
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;

    // メールホワイトリスト確認
    const allowedEmails = (process.env.ADMIN_ALLOWED_EMAILS || '')
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);

    if (allowedEmails.length > 0 && !allowedEmails.includes(user.email)) {
        return null;
    }

    return user;
}
