/**
 * 管理者認証ミドルウェア
 * Authorization: Bearer パスワード 形式で認証
 */
export function verifyAdmin(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return false;

    const password = authHeader.replace('Bearer ', '');
    return password === process.env.ADMIN_PASSWORD;
}
