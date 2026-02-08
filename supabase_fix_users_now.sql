-- 既存ユーザーにtenant_idを設定（即座に実行可能）

-- ============================================
-- 1. デフォルトテナントを確認・作成
-- ============================================
INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, domain)
VALUES ('デフォルトテナント', 'basic', 10000, 100000, 'active', 'narukami-six.vercel.app')
ON CONFLICT DO NOTHING;

-- ============================================
-- 2. 既存ユーザーにtenant_idを設定
-- ============================================
UPDATE users
SET tenant_id = (
    SELECT id FROM tenants 
    WHERE domain = 'narukami-six.vercel.app' 
    LIMIT 1
)
WHERE tenant_id IS NULL;

-- ============================================
-- 3. 結果を確認
-- ============================================
-- テナントごとのユーザー数を確認
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    t.domain,
    COUNT(u.id) as user_count
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
GROUP BY t.id, t.name, t.domain
ORDER BY t.id;

-- 更新されたユーザー数を確認
SELECT 
    COUNT(*) as updated_users
FROM users
WHERE tenant_id IS NOT NULL;
