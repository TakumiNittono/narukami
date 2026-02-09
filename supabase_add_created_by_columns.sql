-- 作成者・更新者を記録するカラムを追加
-- ステップ配信と通知の作成者を識別できるようにする

-- step_sequencesテーブルに作成者・更新者カラムを追加
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'step_sequences' 
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE step_sequences 
        ADD COLUMN created_by VARCHAR(200);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'step_sequences' 
        AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE step_sequences 
        ADD COLUMN updated_by VARCHAR(200);
    END IF;
END $$;

-- notificationsテーブルに作成者・更新者カラムを追加
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'notifications' 
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE notifications 
        ADD COLUMN created_by VARCHAR(200);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'notifications' 
        AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE notifications 
        ADD COLUMN updated_by VARCHAR(200);
    END IF;
END $$;

-- コメントを追加
COMMENT ON COLUMN step_sequences.created_by IS '作成者名（管理者名）';
COMMENT ON COLUMN step_sequences.updated_by IS '最終更新者名（管理者名）';
COMMENT ON COLUMN notifications.created_by IS '作成者名（管理者名）';
COMMENT ON COLUMN notifications.updated_by IS '最終更新者名（管理者名）';

-- 確認用クエリ
SELECT 
    'step_sequences' as table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'step_sequences'
  AND column_name IN ('created_by', 'updated_by')
UNION ALL
SELECT 
    'notifications' as table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND column_name IN ('created_by', 'updated_by');
