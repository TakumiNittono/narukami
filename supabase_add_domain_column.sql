-- tenantsテーブルにdomainカラムを安全に追加
-- このSQLは既にdomainカラムが存在する場合でもエラーになりません

-- ============================================
-- 1. tenantsテーブルが存在するか確認し、存在しない場合は作成
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

-- ============================================
-- 2. domainカラムを追加（存在しない場合のみ）
-- ============================================
DO $$ 
BEGIN
    -- domainカラムが存在しない場合のみ追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'domain'
    ) THEN
        ALTER TABLE tenants ADD COLUMN domain VARCHAR(255);
        ALTER TABLE tenants ADD COLUMN custom_branding JSONB DEFAULT '{}';
        ALTER TABLE tenants ADD COLUMN settings JSONB DEFAULT '{}';
        
        -- ユニークインデックス（NULL値は許可）
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain_unique 
        ON tenants (domain) WHERE domain IS NOT NULL;
        
        RAISE NOTICE 'Added domain, custom_branding, and settings columns to tenants table';
    ELSE
        RAISE NOTICE 'domain column already exists in tenants table';
    END IF;
END $$;

-- ============================================
-- 3. tenant_domainsテーブルを作成（存在しない場合）
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
-- 4. デフォルトテナントを作成してドメインを設定
-- ============================================
INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, domain)
VALUES ('デフォルトテナント', 'basic', 10000, 100000, 'active', 'admin-mvp-six.vercel.app')
ON CONFLICT (id) DO UPDATE 
SET domain = EXCLUDED.domain
WHERE tenants.domain IS NULL;

-- 既存のテナントにドメインが設定されていない場合、デフォルトドメインを設定
UPDATE tenants 
SET domain = 'admin-mvp-six.vercel.app'
WHERE domain IS NULL 
AND id = (SELECT id FROM tenants WHERE name = 'デフォルトテナント' LIMIT 1);

-- ============================================
-- 5. 確認: テナントとドメインの設定を確認
-- ============================================
SELECT id, name, domain, plan, status FROM tenants;
