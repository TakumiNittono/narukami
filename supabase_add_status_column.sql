-- notificationsテーブルにstatusカラムを追加
-- エラー: Could not find the 'status' column of 'notifications' in the schema cache

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'scheduled';

-- statusカラムにインデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications (status);

-- statusカラムのコメントを追加
COMMENT ON COLUMN notifications.status IS 'scheduled / sent / cancelled';

-- 既存のレコードのstatusを設定（sentカラムがtrueの場合は'sent'、それ以外は'scheduled'）
UPDATE notifications 
SET status = CASE 
    WHEN sent = true THEN 'sent'
    WHEN send_at < NOW() AND sent = false THEN 'pending'
    ELSE 'scheduled'
END
WHERE status IS NULL;
