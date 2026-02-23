-- テナントの状態を確認して、必要に応じて設定するSQL

-- ============================================
-- 1. 現在のテナント一覧を確認
-- ============================================
SELECT id, name, domain, plan, status, monthly_sent_count, monthly_limit 
FROM tenants 
ORDER BY id;

-- ============================================
-- 2. テナントが存在しない場合、作成する
-- ============================================
INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, domain)
VALUES ('デフォルトテナント', 'basic', 10000, 100000, 'active', 'admin-mvp-six.vercel.app')
ON CONFLICT DO NOTHING
RETURNING id, name, domain;

-- ============================================
-- 3. 既存のテナントにドメインを設定（domainがNULLの場合）
-- ============================================
UPDATE tenants 
SET domain = 'admin-mvp-six.vercel.app'
WHERE domain IS NULL 
AND id = (SELECT id FROM tenants ORDER BY id LIMIT 1);

-- ============================================
-- 4. 再度確認: テナントとドメインの設定
-- ============================================
SELECT id, name, domain, plan, status FROM tenants;

-- ============================================
-- 5. ユーザー数とtenant_idの分布を確認
-- ============================================
SELECT 
    CASE 
        WHEN tenant_id IS NULL THEN 'NULL（未設定）' 
        ELSE 'tenant_id: ' || tenant_id::text 
    END as tenant_status,
    COUNT(*) as user_count
FROM users
GROUP BY tenant_id
ORDER BY tenant_id NULLS LAST;

-- ============================================
-- 6. 特定のテナントのユーザー数を確認
-- ============================================
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    t.domain,
    COUNT(u.id) as user_count
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
GROUP BY t.id, t.name, t.domain
ORDER BY t.id;
