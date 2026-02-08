-- 管理画面強化 Phase 1: データベースマイグレーション
-- 通知効果測定・フィルタリング送信・セグメント管理のためのテーブル作成

-- ============================================
-- 1. notification_events テーブル（通知イベントログ）
-- ============================================
CREATE TABLE IF NOT EXISTS notification_events (
    id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT NOT NULL,
    notification_type VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('sent', 'delivered', 'open', 'click', 'dismiss')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ne_notification ON notification_events (notification_id);
CREATE INDEX IF NOT EXISTS idx_ne_event_type ON notification_events (event_type);
CREATE INDEX IF NOT EXISTS idx_ne_created_at ON notification_events (created_at);
CREATE INDEX IF NOT EXISTS idx_ne_user ON notification_events (user_id);
CREATE INDEX IF NOT EXISTS idx_ne_notification_type ON notification_events (notification_type);

COMMENT ON TABLE notification_events IS '通知イベントログ（送信・開封・クリック等）';
COMMENT ON COLUMN notification_events.notification_type IS 'scheduled / step / immediate';
COMMENT ON COLUMN notification_events.event_type IS 'sent / delivered / open / click / dismiss';

-- ============================================
-- 2. notification_stats テーブル（通知別の集計キャッシュ）
-- ============================================
CREATE TABLE IF NOT EXISTS notification_stats (
    notification_id BIGINT PRIMARY KEY,
    notification_type VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    total_sent INT DEFAULT 0,
    total_delivered INT DEFAULT 0,
    total_opened INT DEFAULT 0,
    total_clicked INT DEFAULT 0,
    total_dismissed INT DEFAULT 0,
    open_rate DECIMAL(5,2) DEFAULT 0,
    ctr DECIMAL(5,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ns_type ON notification_stats (notification_type);
CREATE INDEX IF NOT EXISTS idx_ns_updated_at ON notification_stats (updated_at);

COMMENT ON TABLE notification_stats IS '通知別のパフォーマンス集計キャッシュ';
COMMENT ON COLUMN notification_stats.open_rate IS '開封率（%）';
COMMENT ON COLUMN notification_stats.ctr IS 'クリックスルー率（%）';

-- ============================================
-- 3. user_segments テーブル（セグメント定義）
-- ============================================
CREATE TABLE IF NOT EXISTS user_segments (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    filter_conditions JSONB NOT NULL,
    is_dynamic BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segments_name ON user_segments (name);

COMMENT ON TABLE user_segments IS 'ユーザーセグメント定義';
COMMENT ON COLUMN user_segments.filter_conditions IS 'フィルター条件（JSON形式）';
COMMENT ON COLUMN user_segments.is_dynamic IS '動的セグメントかどうか（true=条件に基づいて自動計算）';

-- ============================================
-- 4. user_tags テーブル（ユーザータグ）
-- ============================================
CREATE TABLE IF NOT EXISTS user_tags (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON user_tags (tag);
CREATE INDEX IF NOT EXISTS idx_user_tags_user ON user_tags (user_id);

COMMENT ON TABLE user_tags IS 'ユーザーに付与する手動タグ';

-- ============================================
-- 5. users テーブルの拡張
-- ============================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS device_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS browser VARCHAR(50),
ADD COLUMN IF NOT EXISTS os VARCHAR(50),
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS engagement_score INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_device_type ON users (device_type);
CREATE INDEX IF NOT EXISTS idx_users_browser ON users (browser);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users (last_active_at);

COMMENT ON COLUMN users.device_type IS 'ios / android / desktop / other';
COMMENT ON COLUMN users.engagement_score IS 'エンゲージメントスコア（0-100）';

-- ============================================
-- 6. notifications テーブルの拡張
-- ============================================
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) DEFAULT 'all',
ADD COLUMN IF NOT EXISTS target_segment_id BIGINT REFERENCES user_segments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS target_filter JSONB,
ADD COLUMN IF NOT EXISTS target_user_count INT,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'scheduled',
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_target_type ON notifications (target_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications (status);
CREATE INDEX IF NOT EXISTS idx_notifications_deleted_at ON notifications (deleted_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN notifications.target_type IS 'all / segment / custom_filter';
COMMENT ON COLUMN notifications.status IS 'draft / scheduled / sent / cancelled';
COMMENT ON COLUMN notifications.target_filter IS 'カスタムフィルター条件（JSON形式）';

-- 既存データの移行: sent = true → status = 'sent', sent = false → status = 'scheduled'
UPDATE notifications SET status = CASE WHEN sent = TRUE THEN 'sent' ELSE 'scheduled' END WHERE status = 'scheduled';

-- ============================================
-- RLS（Row Level Security）設定
-- ============================================
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tags ENABLE ROW LEVEL SECURITY;

-- notification_events: 匿名ユーザーからのINSERTのみ許可（トラッキング用）
DROP POLICY IF EXISTS "Allow anonymous insert events" ON notification_events;
CREATE POLICY "Allow anonymous insert events" ON notification_events
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- その他のテーブルは service_role key のみアクセス可能（既存のRLS設定を継承）
