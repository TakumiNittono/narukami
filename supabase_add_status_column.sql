-- notificationsテーブルに不足しているカラムを追加
-- エラー: Could not find the 'status' column of 'notifications' in the schema cache
-- エラー: Could not find the 'target_filter' column of 'notifications' in the schema cache

-- statusカラムを追加
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'scheduled';

-- target_filterカラムを追加（JSONB型）
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS target_filter JSONB;

-- target_typeカラムを追加
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) DEFAULT 'all';

-- target_segment_idカラムを追加
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS target_segment_id BIGINT;

-- target_user_countカラムを追加
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS target_user_count INT;

-- tenant_idカラムを追加（既に存在する可能性があるが、念のため）
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS tenant_id BIGINT;

-- deleted_atカラムを追加
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications (status);
CREATE INDEX IF NOT EXISTS idx_notifications_target_type ON notifications (target_type);
CREATE INDEX IF NOT EXISTS idx_notifications_deleted_at ON notifications (deleted_at) WHERE deleted_at IS NULL;

-- コメントを追加
COMMENT ON COLUMN notifications.status IS 'scheduled / sent / cancelled';
COMMENT ON COLUMN notifications.target_type IS 'all / segment / custom_filter';
COMMENT ON COLUMN notifications.target_filter IS 'カスタムフィルター条件（JSONB形式）';

-- 既存のレコードのstatusを設定（sentカラムがtrueの場合は'sent'、それ以外は'scheduled'）
UPDATE notifications 
SET status = CASE 
    WHEN sent = true THEN 'sent'
    WHEN send_at < NOW() AND sent = false THEN 'pending'
    ELSE 'scheduled'
END
WHERE status IS NULL;
