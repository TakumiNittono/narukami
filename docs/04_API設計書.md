# 04. API設計書

## 概要

Vercel Serverless Functions（Node.js）でAPIを実装する。
`/api/` ディレクトリ内の `.js` ファイルが自動でAPIエンドポイントになる。

---

## エンドポイント一覧

| # | メソッド | パス | 認証 | 用途 |
|---|---|---|---|---|
| 1 | POST | `/api/register-token` | なし | FCMトークン登録 |
| 2 | GET | `/api/notifications/list` | 管理者パスワード | 通知一覧取得 |
| 3 | POST | `/api/notifications/create` | 管理者パスワード | 通知作成（予約） |
| 4 | POST | `/api/send-notification` | 管理者パスワード | テスト送信（即時） |
| 5 | GET | `/api/cron/send-scheduled` | CRON_SECRET | cron予約送信 |
| 6 | GET | `/api/stats` | 管理者パスワード | 登録ユーザー数取得 |

---

## 共通仕様

### レスポンス形式
すべてJSON。

```json
{
    "status": "ok" | "error",
    "message": "説明テキスト",
    "data": { ... }  // 必要に応じて
}
```

### 管理者認証
管理画面APIは `Authorization` ヘッダーでパスワード認証する。

```javascript
// lib/auth.js
export function verifyAdmin(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return false;

    // "Bearer パスワード" 形式
    const password = authHeader.replace('Bearer ', '');
    return password === process.env.ADMIN_PASSWORD;
}
```

### Vercel Cron認証
cronエンドポイントは `CRON_SECRET` ヘッダーで認証する。

```javascript
// Vercelが自動付与する Authorization ヘッダーを検証
if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
}
```

---

## 1. FCMトークン登録

### `POST /api/register-token`

ユーザーが通知を許可した際に、FCMトークンをサーバーに送信する。

#### ファイル: `api/register-token.js`

```javascript
import { supabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ status: 'error', message: 'Token is required' });
    }

    try {
        const { error } = await supabaseAdmin
            .from('users')
            .upsert({ fcm_token: token }, { onConflict: 'fcm_token' });

        if (error) throw error;

        return res.status(200).json({ status: 'ok', message: 'Token registered' });
    } catch (err) {
        console.error('Token registration error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
```

#### リクエスト例
```json
POST /api/register-token
Content-Type: application/json

{
    "token": "fMk2x9Abc..."
}
```

#### レスポンス
```json
// 成功
{ "status": "ok", "message": "Token registered" }

// エラー
{ "status": "error", "message": "Token is required" }
```

---

## 2. 通知一覧取得

### `GET /api/notifications/list`

#### ファイル: `api/notifications/list.js`

```javascript
import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json({ status: 'ok', data });
    } catch (err) {
        console.error('List error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
```

---

## 3. 通知作成

### `POST /api/notifications/create`

#### ファイル: `api/notifications/create.js`

```javascript
import { supabaseAdmin } from '../../lib/supabase.js';
import { verifyAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { title, body, url, send_at } = req.body;

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

    try {
        const { data, error } = await supabaseAdmin
            .from('notifications')
            .insert({
                title,
                body,
                url: url || '',
                send_at: new Date(send_at).toISOString(),
            })
            .select();

        if (error) throw error;

        return res.status(200).json({ status: 'ok', message: 'Notification created', data });
    } catch (err) {
        console.error('Create error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
}
```

#### リクエスト例
```json
POST /api/notifications/create
Authorization: Bearer YOUR_ADMIN_PASSWORD
Content-Type: application/json

{
    "title": "週末セールのお知らせ",
    "body": "今週末は全品20%OFFでお買い得です！",
    "url": "https://example.com/sale",
    "send_at": "2026-02-10T09:00:00+09:00"
}
```

---

## 4. テスト送信（即時）

### `POST /api/send-notification`

#### ファイル: `api/send-notification.js`

```javascript
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
```

---

## 5. cron予約送信

### `GET /api/cron/send-scheduled`

Vercel Cronから5分間隔で自動実行される。
詳細は `07_通知送信フロー設計書.md` を参照。

---

## 6. 登録ユーザー数取得

### `GET /api/stats`

#### ファイル: `api/stats.js`

```javascript
import { supabaseAdmin } from '../lib/supabase.js';
import { verifyAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
    if (!verifyAdmin(req)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
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
```

---

## 共通ライブラリ

### lib/supabase.js

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

### lib/firebase-admin.js

```javascript
import admin from 'firebase-admin';

let initialized = false;

export function getFirebaseAdmin() {
    if (!initialized) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // 環境変数内の改行を復元
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
        initialized = true;
    }
    return admin;
}
```

### lib/auth.js

```javascript
export function verifyAdmin(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return false;

    const password = authHeader.replace('Bearer ', '');
    return password === process.env.ADMIN_PASSWORD;
}
```

---

## セキュリティ考慮事項

| 項目 | 対策 |
|---|---|
| APIキー漏洩 | Firebase Admin認証情報・Supabase service_role keyはVercel環境変数で管理 |
| 不正トークン登録 | MVPでは許容（レート制限はPhase2） |
| 管理画面アクセス | Authorization ヘッダーでパスワード認証 |
| cron不正実行 | CRON_SECRET で認証 |
| CORS | register-token のみ `*` 許可、管理系は管理画面ドメインのみ |
| SQL Injection | supabase-js 使用のため安全 |
