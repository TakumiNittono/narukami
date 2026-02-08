-- フルマネージドサービス対応: マルチテナント + 顧客管理
-- API数制限を考慮して、既存テーブルを拡張
--
-- 注意: このスクリプトは、基本的なテーブル（users, notifications, step_sequences）が
-- 存在することを前提としています。
-- user_segments, notification_events, notification_stats テーブルは
-- supabase_admin_enhancement_setup.sql で作成されますが、存在しない場合でも
-- エラーにならないように条件付きで処理されます。

-- ============================================
-- 1. tenants テーブル（テナント管理）
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

COMMENT ON TABLE tenants IS 'フルマネージドサービスの顧客（テナント）管理';
COMMENT ON COLUMN tenants.plan IS 'basic(¥10万), pro(¥25万), enterprise(¥50万)';
COMMENT ON COLUMN tenants.monthly_sent_count IS '今月の送信数';
COMMENT ON COLUMN tenants.monthly_limit IS '月間送信上限';

-- ============================================
-- 2. customer_users テーブル（顧客の担当者）
-- ============================================
CREATE TABLE IF NOT EXISTS customer_users (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    supabase_auth_user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_customer_users_tenant ON customer_users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_users_email ON customer_users (email);

COMMENT ON TABLE customer_users IS '顧客の担当者（ログイン可能なユーザー）';
COMMENT ON COLUMN customer_users.role IS 'admin(管理者), viewer(閲覧のみ)';

-- ============================================
-- 3. tasks テーブル（作業管理）
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('notification_create', 'step_sequence_create', 'segment_create', 'report_create', 'optimization', 'support')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date) WHERE status IN ('pending', 'in_progress');

COMMENT ON TABLE tasks IS 'フルマネージドサービスの作業管理';
COMMENT ON COLUMN tasks.task_type IS '作業タイプ（通知作成、ステップ配信設計等）';

-- ============================================
-- 4. reports テーブル（レポート管理）
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL DEFAULT 'monthly' CHECK (report_type IN ('weekly', 'monthly', 'custom')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    title VARCHAR(200) NOT NULL,
    summary TEXT,
    data JSONB DEFAULT '{}',
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports (tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_period ON reports (period_start, period_end);

COMMENT ON TABLE reports IS '顧客向けレポート（月次レポート等）';
COMMENT ON COLUMN reports.data IS 'レポートデータ（JSON形式）';

-- ============================================
-- 5. 既存テーブルにtenant_idを追加
-- ============================================
-- 注意: 以下のテーブルが存在する場合のみtenant_idを追加します
-- user_segments, notification_events, notification_stats は
-- supabase_admin_enhancement_setup.sql で作成される必要があります

-- users テーブル
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);
    END IF;
END $$;

-- notifications テーブル
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications (tenant_id);
    END IF;
END $$;

-- step_sequences テーブル
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'step_sequences') THEN
        ALTER TABLE step_sequences ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_step_sequences_tenant ON step_sequences (tenant_id);
    END IF;
END $$;

-- user_segments テーブル（supabase_admin_enhancement_setup.sqlで作成済みの場合）
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_segments') THEN
        ALTER TABLE user_segments ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_user_segments_tenant ON user_segments (tenant_id);
    END IF;
END $$;

-- notification_events テーブル（supabase_admin_enhancement_setup.sqlで作成済みの場合）
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notification_events') THEN
        ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_notification_events_tenant ON notification_events (tenant_id);
    END IF;
END $$;

-- notification_stats テーブル（supabase_admin_enhancement_setup.sqlで作成済みの場合）
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notification_stats') THEN
        ALTER TABLE notification_stats ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_notification_stats_tenant ON notification_stats (tenant_id);
    END IF;
END $$;

-- ============================================
-- 6. RLS（Row Level Security）設定
-- ============================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- サービス提供者（service_role key）のみアクセス可能
-- 顧客はSupabase Auth経由でアクセス（別途実装）

-- ============================================
-- 7. サンプルデータ（テスト用）
-- ============================================
-- テスト用テナント（本番では削除）
-- INSERT INTO tenants (name, plan, monthly_limit, monthly_fee, status, contract_start_date)
-- VALUES 
--     ('テスト企業A', 'pro', 100000, 250000, 'active', CURRENT_DATE),
--     ('テスト企業B', 'basic', 10000, 100000, 'active', CURRENT_DATE)
-- ON CONFLICT DO NOTHING;
