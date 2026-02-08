-- 既存ユーザーのtenant_idを設定するマイグレーション
-- 注意: このスクリプトは既存のユーザーにtenant_idを設定します
-- デフォルトテナントを作成して、既存ユーザーをそのテナントに紐付けます

-- ============================================
-- 1. デフォルトテナントを作成（存在しない場合）
-- ============================================
INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, domain)
VALUES ('デフォルトテナント', 'basic', 10000, 100000, 'active', 'narukami-six.vercel.app')
ON CONFLICT DO NOTHING
RETURNING id;

-- デフォルトテナントのIDを取得
DO $$
DECLARE
    default_tenant_id BIGINT;
BEGIN
    -- デフォルトテナントを取得または作成
    SELECT id INTO default_tenant_id
    FROM tenants
    WHERE domain = 'narukami-six.vercel.app'
    LIMIT 1;
    
    -- テナントが存在しない場合は作成
    IF default_tenant_id IS NULL THEN
        INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, domain)
        VALUES ('デフォルトテナント', 'basic', 10000, 100000, 'active', 'narukami-six.vercel.app')
        RETURNING id INTO default_tenant_id;
    END IF;
    
    -- tenant_idがNULLの既存ユーザーにデフォルトテナントIDを設定
    UPDATE users
    SET tenant_id = default_tenant_id
    WHERE tenant_id IS NULL;
    
    RAISE NOTICE 'Updated users with tenant_id: %', default_tenant_id;
END $$;

-- ============================================
-- 2. 他のドメイン用のテナント設定例
-- ============================================
-- 各顧客のドメインに応じてテナントを作成し、usersテーブルのtenant_idを更新してください
-- 例:
-- UPDATE tenants SET domain = 'customer1.com' WHERE id = 1;
-- UPDATE users SET tenant_id = 1 WHERE ... (適切な条件で)
