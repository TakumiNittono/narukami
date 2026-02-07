-- ステップ配信システム用のテーブル作成

-- 1. usersテーブルの拡張（既存テーブルにカラム追加）
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS step_sequence_id BIGINT DEFAULT NULL;

-- 2. step_sequencesテーブル（ステップ配信シーケンス管理）
CREATE TABLE IF NOT EXISTS step_sequences (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE step_sequences IS 'ステップ配信のシーケンス（配信シナリオ）を管理';
COMMENT ON COLUMN step_sequences.name IS 'シーケンス名（例: 新規登録ウェルカムシリーズ）';
COMMENT ON COLUMN step_sequences.is_active IS '有効/無効フラグ';

-- 3. step_notificationsテーブル（ステップごとの通知設定）
CREATE TABLE IF NOT EXISTS step_notifications (
    id BIGSERIAL PRIMARY KEY,
    sequence_id BIGINT NOT NULL REFERENCES step_sequences(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    url TEXT DEFAULT '',
    delay_type VARCHAR(20) NOT NULL CHECK (delay_type IN ('immediate', 'minutes', 'hours', 'days', 'scheduled')),
    delay_value INT DEFAULT 0,
    scheduled_time TIME DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sequence_id, step_order)
);

COMMENT ON TABLE step_notifications IS '各ステップの通知内容と配信タイミング';
COMMENT ON COLUMN step_notifications.step_order IS 'ステップの順序（1,2,3...）';
COMMENT ON COLUMN step_notifications.delay_type IS '配信タイミングタイプ: immediate(即時), minutes(n分後), hours(n時間後), days(n日後), scheduled(時刻指定)';
COMMENT ON COLUMN step_notifications.delay_value IS 'delay_typeがminutes/hours/daysの場合の数値';
COMMENT ON COLUMN step_notifications.scheduled_time IS 'delay_typeがscheduledの場合の時刻（例: 10:00:00）';

-- 4. user_step_progressテーブル（ユーザーごとのステップ配信進捗）
CREATE TABLE IF NOT EXISTS user_step_progress (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sequence_id BIGINT NOT NULL REFERENCES step_sequences(id) ON DELETE CASCADE,
    current_step INT DEFAULT 0,
    next_notification_at TIMESTAMPTZ DEFAULT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sequence_id)
);

COMMENT ON TABLE user_step_progress IS 'ユーザーごとのステップ配信進捗';
COMMENT ON COLUMN user_step_progress.current_step IS '現在のステップ番号（0=未開始）';
COMMENT ON COLUMN user_step_progress.next_notification_at IS '次の通知配信予定日時';
COMMENT ON COLUMN user_step_progress.completed IS 'シーケンス完了フラグ';

-- 5. step_notification_logsテーブル（配信ログ）
CREATE TABLE IF NOT EXISTS step_notification_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sequence_id BIGINT NOT NULL REFERENCES step_sequences(id) ON DELETE CASCADE,
    step_notification_id BIGINT NOT NULL REFERENCES step_notifications(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT DEFAULT NULL
);

COMMENT ON TABLE step_notification_logs IS 'ステップ配信の送信履歴';

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_step_notifications_sequence ON step_notifications(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS idx_user_step_progress_user ON user_step_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_step_progress_next ON user_step_progress(next_notification_at) WHERE completed = FALSE;
CREATE INDEX IF NOT EXISTS idx_step_notification_logs_user ON step_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_step_notification_logs_sequence ON step_notification_logs(sequence_id);

-- RLS（Row Level Security）設定
ALTER TABLE step_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_step_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_notification_logs ENABLE ROW LEVEL SECURITY;

-- サンプルデータ挿入（例: 新規登録ウェルカムシリーズ）
INSERT INTO step_sequences (name, description, is_active) 
VALUES ('新規登録ウェルカムシリーズ', 'ユーザー登録後の段階的な案内通知', TRUE)
ON CONFLICT DO NOTHING;

-- サンプルステップ通知
DO $$
DECLARE
    v_sequence_id BIGINT;
BEGIN
    SELECT id INTO v_sequence_id FROM step_sequences WHERE name = '新規登録ウェルカムシリーズ' LIMIT 1;
    
    IF v_sequence_id IS NOT NULL THEN
        -- ステップ1: 登録直後（即時）
        INSERT INTO step_notifications (sequence_id, step_order, title, body, url, delay_type, delay_value)
        VALUES (v_sequence_id, 1, 'ようこそ！', '登録ありがとうございます。これから定期的に役立つ情報をお届けします。', '', 'immediate', 0)
        ON CONFLICT DO NOTHING;
        
        -- ステップ2: 30分後
        INSERT INTO step_notifications (sequence_id, step_order, title, body, url, delay_type, delay_value)
        VALUES (v_sequence_id, 2, '使い方ガイド', 'アプリの基本的な使い方をご案内します。', '', 'minutes', 30)
        ON CONFLICT DO NOTHING;
        
        -- ステップ3: 1時間後
        INSERT INTO step_notifications (sequence_id, step_order, title, body, url, delay_type, delay_value)
        VALUES (v_sequence_id, 3, 'おすすめ機能', 'こんな便利な機能があります！ぜひお試しください。', '', 'hours', 1)
        ON CONFLICT DO NOTHING;
        
        -- ステップ4: 2時間後
        INSERT INTO step_notifications (sequence_id, step_order, title, body, url, delay_type, delay_value)
        VALUES (v_sequence_id, 4, '活用のコツ', 'より効果的に活用するためのヒントをご紹介します。', '', 'hours', 2)
        ON CONFLICT DO NOTHING;
        
        -- ステップ5: 毎日10時に配信
        INSERT INTO step_notifications (sequence_id, step_order, title, body, url, delay_type, delay_value, scheduled_time)
        VALUES (v_sequence_id, 5, '今日のおすすめ', '本日のおすすめ情報をお届けします。', '', 'scheduled', 0, '10:00:00')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
