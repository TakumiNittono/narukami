-- notification_statsテーブルを作成（tenant_idカラムを含む）
-- 開封率・CTRトラッキングのためのテーブル

-- notification_statsテーブルが存在しない場合は作成
CREATE TABLE IF NOT EXISTS notification_stats (
    notification_id BIGINT PRIMARY KEY,
    notification_type VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    tenant_id BIGINT,
    total_sent INT DEFAULT 0,
    total_delivered INT DEFAULT 0,
    total_opened INT DEFAULT 0,
    total_clicked INT DEFAULT 0,
    total_dismissed INT DEFAULT 0,
    open_rate DECIMAL(5,2) DEFAULT 0,
    ctr DECIMAL(5,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- tenant_idカラムが存在しない場合は追加
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'notification_stats' 
        AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE notification_stats 
        ADD COLUMN tenant_id BIGINT;
        
        -- tenantsテーブルが存在する場合は外部キー制約を追加
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tenants') THEN
            ALTER TABLE notification_stats 
            ADD CONSTRAINT fk_notification_stats_tenant 
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_ns_type ON notification_stats (notification_type);
CREATE INDEX IF NOT EXISTS idx_ns_updated_at ON notification_stats (updated_at);
CREATE INDEX IF NOT EXISTS idx_ns_tenant_id ON notification_stats (tenant_id);

-- コメントを追加
COMMENT ON TABLE notification_stats IS '通知別のパフォーマンス集計キャッシュ';
COMMENT ON COLUMN notification_stats.open_rate IS '開封率（%）';
COMMENT ON COLUMN notification_stats.ctr IS 'クリックスルー率（%）';
COMMENT ON COLUMN notification_stats.tenant_id IS 'テナントID（マルチテナント対応）';

-- notification_eventsテーブルも存在しない場合は作成
CREATE TABLE IF NOT EXISTS notification_events (
    id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT NOT NULL,
    notification_type VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('sent', 'delivered', 'open', 'click', 'dismiss')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- notification_eventsのインデックスを作成
CREATE INDEX IF NOT EXISTS idx_ne_notification ON notification_events (notification_id);
CREATE INDEX IF NOT EXISTS idx_ne_event_type ON notification_events (event_type);
CREATE INDEX IF NOT EXISTS idx_ne_created_at ON notification_events (created_at);
CREATE INDEX IF NOT EXISTS idx_ne_user ON notification_events (user_id);
CREATE INDEX IF NOT EXISTS idx_ne_notification_type ON notification_events (notification_type);

-- 確認用クエリ
SELECT 
    'notification_stats' as table_name,
    COUNT(*) as row_count
FROM notification_stats
UNION ALL
SELECT 
    'notification_events' as table_name,
    COUNT(*) as row_count
FROM notification_events;
