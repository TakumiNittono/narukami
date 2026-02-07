import { supabaseAdmin } from '../lib/supabase.js';
import { getFirebaseAdmin } from '../lib/firebase-admin.js';
import { verifyAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { title, body, url } = req.body;

    if (!title || !body) {
        return res.status(400).json({ status: 'error', message: 'title and body are required' });
    }

    try {
        // 全ユーザーのトークン取得
        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('fcm_token');

        if (error) throw error;

        if (!users || users.length === 0) {
            return res.status(200).json({ status: 'ok', sent_count: 0, message: 'No users' });
        }

        const tokens = users.map(u => u.fcm_token);
        const admin = getFirebaseAdmin();

        // 一斉送信（multicast）
        const message = {
            notification: { title, body },
            webpush: {
                notification: {
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                },
                fcmOptions: {
                    link: url || '/',
                },
            },
            tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        return res.status(200).json({
            status: 'ok',
            sent_count: response.successCount,
            error_count: response.failureCount,
        });
    } catch (err) {
        console.error('Send error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
