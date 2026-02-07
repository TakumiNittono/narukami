# Narukami MVP

PWA × FCM プッシュ通知 × ステップ配信のMVP版

## セットアップ手順

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` ファイルを作成し、`.env.example` を参考に以下の値を設定：

- Firebase設定（Firebase Consoleから取得）
- Supabase設定（Supabaseダッシュボードから取得）
- 管理画面パスワード
- Cron認証用シークレット

### 3. Firebase設定の反映

`js/app.js` と `public/firebase-messaging-sw.js` の以下の値を実際の値に置き換え：

- `firebaseConfig` オブジェクト
- `VAPID_KEY`

### 4. アイコンの準備

`public/icons/` に以下を配置：

- `icon-192.png` (192x192px)
- `icon-512.png` (512x512px)

### 5. Supabaseテーブル作成

Supabase SQL Editorで以下を実行：

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    fcm_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    url TEXT DEFAULT '',
    send_at TIMESTAMPTZ NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_pending ON notifications (send_at) WHERE sent = FALSE;
CREATE INDEX idx_users_token ON users (fcm_token);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous insert" ON users
    FOR INSERT
    TO anon
    WITH CHECK (true);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
```

### 6. Vercelデプロイ

1. GitHubリポジトリにpush
2. Vercelでプロジェクトをインポート
3. 環境変数をVercelダッシュボードで設定
4. デプロイ完了

### 7. ローカル開発

```bash
vercel dev
```

http://localhost:3000 でアクセス

## ファイル構成

```
MVPnarukami/
├── api/              # Vercel Serverless Functions
├── admin/            # 管理画面
├── lib/              # 共通ライブラリ
├── pages/            # ユーザー向けページ
├── public/           # 静的ファイル（PWA用）
├── styles/           # CSS
├── js/               # フロントエンドJS
└── docs/             # 開発ドキュメント
```

## 注意事項

- Firebase設定は `js/app.js` と `public/firebase-messaging-sw.js` の両方に必要
- Vercel Hobbyプランではcronが1日1回まで（`vercel.json` で `0 * * * *` に設定済み）
- 5分間隔のcronが必要な場合はProプラン（$20/月）に移行

## 開発ドキュメント

詳細は `docs/` フォルダを参照してください。
