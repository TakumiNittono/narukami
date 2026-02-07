-- SupabaseテーブルセットアップSQL
-- 既存のテーブルがある場合は削除してから再作成します

-- 既存のテーブルを削除（データも削除されます）
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- usersテーブル作成
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    fcm_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- notificationsテーブル作成
CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    url TEXT DEFAULT '',
    send_at TIMESTAMPTZ NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_notifications_pending ON notifications (send_at) WHERE sent = FALSE;
CREATE INDEX idx_users_token ON users (fcm_token);

-- RLS（Row Level Security）設定
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（エラー回避のため）
DROP POLICY IF EXISTS "Allow anonymous insert" ON users;

-- usersテーブル: INSERT のみ許可（anonキー用）
CREATE POLICY "Allow anonymous insert" ON users
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- notificationsテーブル: サーバーサイドのみ操作（service_role key使用）
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
