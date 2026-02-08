-- テナントドメイン対応: 各顧客が異なるドメインで運用
-- tenantsテーブルにdomainカラムを追加

-- ============================================
-- 1. tenantsテーブルにdomainカラムを追加
-- ============================================
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS domain VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS custom_branding JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants (domain);

COMMENT ON COLUMN tenants.domain IS '顧客のドメイン（例: example.com）';
COMMENT ON COLUMN tenants.custom_branding IS 'カスタムブランディング設定（ロゴ、色等）';
COMMENT ON COLUMN tenants.settings IS 'テナント固有の設定';

-- ============================================
-- 2. ドメインマッピングテーブル（サブドメイン対応）
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

COMMENT ON TABLE tenant_domains IS 'テナントとドメインのマッピング（複数ドメイン対応）';
COMMENT ON COLUMN tenant_domains.is_primary IS 'プライマリドメインかどうか';
