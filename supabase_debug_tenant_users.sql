-- デバッグ用SQL: テナントとユーザーの状態を確認

-- ============================================
-- 1. テナント一覧とドメイン設定を確認
-- ============================================
SELECT 
    id,
    name,
    domain,
    plan,
    status,
    monthly_sent_count,
    monthly_limit
FROM tenants
ORDER BY id;

-- ============================================
-- 2. ユーザー数とtenant_idの分布を確認
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
-- 3. 特定のテナントのユーザー数を確認
-- ============================================
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    t.domain,
    COUNT(u.id) as user_count,
    COUNT(CASE WHEN u.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as new_users_this_week
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
GROUP BY t.id, t.name, t.domain
ORDER BY t.id;

-- ============================================
-- 4. ドメイン 'narukami-six.vercel.app' のテナントを確認
-- ============================================
SELECT 
    t.id,
    t.name,
    t.domain,
    COUNT(u.id) as user_count
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
WHERE t.domain = 'narukami-six.vercel.app'
GROUP BY t.id, t.name, t.domain;

-- ============================================
-- 5. 既存ユーザーにtenant_idを設定（デバッグ用）
-- ============================================
-- 注意: このクエリは既存ユーザーにデフォルトテナントIDを設定します
-- 実行する前に、テナントが存在することを確認してください

-- まず、デフォルトテナントを作成または取得
INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, domain)
VALUES ('デフォルトテナント', 'basic', 10000, 100000, 'active', 'narukami-six.vercel.app')
ON CONFLICT DO NOTHING;

-- 既存ユーザーにtenant_idを設定
UPDATE users
SET tenant_id = (
    SELECT id FROM tenants 
    WHERE domain = 'narukami-six.vercel.app' 
    LIMIT 1
)
WHERE tenant_id IS NULL;

-- 結果を確認
SELECT 
    'Updated users count' as action,
    COUNT(*) as count
FROM users
WHERE tenant_id IS NOT NULL;
