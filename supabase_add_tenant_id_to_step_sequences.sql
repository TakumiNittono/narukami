-- step_sequencesテーブルにtenant_idカラムを追加
-- ステップ配信のマルチテナント対応

-- step_sequencesテーブルにtenant_idカラムを追加
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'step_sequences' 
        AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE step_sequences 
        ADD COLUMN tenant_id BIGINT;
        
        -- tenantsテーブルが存在する場合は外部キー制約を追加
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tenants') THEN
            ALTER TABLE step_sequences 
            ADD CONSTRAINT fk_step_sequences_tenant 
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
        
        -- インデックスを追加
        CREATE INDEX IF NOT EXISTS idx_step_sequences_tenant_id ON step_sequences (tenant_id);
    END IF;
END $$;

-- 確認用クエリ
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'step_sequences'
ORDER BY ordinal_position;
