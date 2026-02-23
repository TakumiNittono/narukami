-- 完全セットアップSQL: テナント管理とドメイン対応を一度に実行
-- このファイルを順番に実行してください

-- ============================================
-- Step 1: tenantsテーブルが存在するか確認し、存在しない場合は作成
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
    monthly_sent_count INT DEFAULT 0,
    monthly_limit INT NOT NULL DEFAULT 10000,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
    contract_start_date DATE,
    contract_end_date DATE,
    monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 100000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants (plan);

-- ============================================
-- Step 2: tenantsテーブルにdomainカラムを追加（存在しない場合）
-- ============================================
DO $$ 
BEGIN
    -- domainカラムが存在しない場合のみ追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'domain'
    ) THEN
        ALTER TABLE tenants 
        ADD COLUMN domain VARCHAR(255),
        ADD COLUMN custom_branding JSONB DEFAULT '{}',
        ADD COLUMN settings JSONB DEFAULT '{}';
        
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain ON tenants (domain) WHERE domain IS NOT NULL;
        
        RAISE NOTICE 'Added domain column to tenants table';
    ELSE
        RAISE NOTICE 'domain column already exists in tenants table';
    END IF;
END $$;

-- ============================================
-- Step 3: tenant_domainsテーブルを作成（存在しない場合）
-- ============================================
CREATE TABLE IF NOT EXISTS tenant_domains (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL UNIQUE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_domain ON tenant_domains (domain);

-- ============================================
-- Step 4: デフォルトテナントを作成（存在しない場合）
-- ============================================
INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, domain)
VALUES ('デフォルトテナント', 'basic', 10000, 100000, 'active', 'admin-mvp-six.vercel.app')
ON CONFLICT DO NOTHING;

-- デフォルトテナントのIDを取得して、既存ユーザーに設定
DO $$
DECLARE
    default_tenant_id BIGINT;
BEGIN
    -- デフォルトテナントを取得
    SELECT id INTO default_tenant_id
    FROM tenants
    WHERE domain = 'admin-mvp-six.vercel.app'
    LIMIT 1;
    
    -- テナントが存在しない場合は作成
    IF default_tenant_id IS NULL THEN
        INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, domain)
        VALUES ('デフォルトテナント', 'basic', 10000, 100000, 'active', 'admin-mvp-six.vercel.app')
        RETURNING id INTO default_tenant_id;
    END IF;
    
    -- tenant_idがNULLの既存ユーザーにデフォルトテナントIDを設定
    UPDATE users
    SET tenant_id = default_tenant_id
    WHERE tenant_id IS NULL;
    
    RAISE NOTICE 'Default tenant ID: %, Updated users with tenant_id', default_tenant_id;
END $$;

-- ============================================
-- Step 5: 確認クエリ
-- ============================================
-- テナント一覧を確認
SELECT id, name, domain, plan, status FROM tenants;

-- ユーザー数とtenant_idの分布を確認
SELECT 
    CASE WHEN tenant_id IS NULL THEN 'NULL' ELSE tenant_id::text END as tenant_id,
    COUNT(*) as user_count
FROM users
GROUP BY tenant_id
ORDER BY tenant_id;
