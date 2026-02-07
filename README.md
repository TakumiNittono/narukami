# Narukami MVP

PWA × Web Push 通知 × **ステップ配信**のMVP版

## 🎯 主な機能

- ✅ PWA対応（iOS/Android）
- ✅ Web Push通知（Web Push API）
- ✅ **ステップ配信システム**（登録直後、n分後、n時間後、n日後、時刻指定）
- ✅ 通知予約機能
- ✅ 管理画面（通知作成・ステップ配信管理）
- ✅ Vercel + Supabaseで構築

---

## 🚀 セットアップ手順

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` ファイルを作成し、`.env.example` を参考に以下の値を設定：

```bash
# Web Push設定
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_EMAIL=your-email@example.com  # 必須

# Supabase設定
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxx
SUPABASE_ANON_KEY=sb_publishable_xxxxx

# 管理画面パスワード
ADMIN_PASSWORD=your-password

# Cron認証用シークレット
CRON_SECRET=your-random-secret-string
```

### 3. VAPIDキーの生成

```bash
node scripts/generate-vapid-keys.js
```

生成されたキーを `.env.local` に設定してください。

### 4. アイコンの準備

`public/icons/` に以下を配置：

- `icon-192.png` (192x192px)
- `icon-512.png` (512x512px)

### 5. Supabaseテーブル作成

#### 5.1 基本テーブルの作成

Supabase SQL Editorで `supabase_setup.sql` の内容を実行：

```bash
# SQLファイルの確認
cat supabase_setup.sql
```

#### 5.2 ステップ配信テーブルの作成

Supabase SQL Editorで `supabase_step_sequences_setup.sql` の内容を実行：

```bash
# SQLファイルの確認
cat supabase_step_sequences_setup.sql
```

詳細なセットアップ手順は `STEP_SEQUENCES_SETUP.md` を参照してください。

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

---

## 📂 ファイル構成

```
MVPnarukami/
├── api/                          # Vercel Serverless Functions
│   ├── cron/
│   │   ├── send-scheduled.js           # 予約通知送信
│   │   └── send-step-notifications.js  # ステップ配信実行
│   ├── notifications/
│   │   ├── create.js                   # 通知作成
│   │   └── list.js                     # 通知一覧
│   ├── step-sequences/
│   │   ├── create.js                   # ステップ配信作成
│   │   ├── list.js                     # ステップ配信一覧
│   │   ├── toggle.js                   # 有効/無効切り替え
│   │   └── delete.js                   # 削除
│   ├── register-token.js               # トークン登録（ステップ配信開始）
│   ├── send-notification.js            # 即時通知送信
│   └── stats.js                        # 統計情報
├── lib/                          # 共通ライブラリ
│   ├── auth.js                         # 認証
│   ├── supabase.js                     # Supabaseクライアント
│   └── webpush.js                      # Web Push設定
├── public/                       # 静的ファイル
│   ├── admin/
│   │   ├── index.html                  # 管理画面ダッシュボード
│   │   ├── create.html                 # 通知作成画面
│   │   ├── sequences.html              # ステップ配信一覧
│   │   ├── sequences-create.html       # ステップ配信作成
│   │   ├── admin.js
│   │   └── admin.css
│   ├── icons/                          # PWAアイコン
│   ├── js/
│   │   └── app.js                      # フロントエンドJS
│   ├── styles/
│   │   └── style.css
│   ├── index.html                      # ユーザー向けトップページ
│   ├── thanks.html                     # 登録完了ページ
│   ├── manifest.json                   # PWAマニフェスト
│   └── sw.js                           # Service Worker
├── scripts/
│   └── generate-vapid-keys.js          # VAPIDキー生成
├── docs/                         # 開発ドキュメント
├── supabase_setup.sql            # 基本テーブル作成SQL
├── supabase_step_sequences_setup.sql  # ステップ配信テーブル作成SQL
├── STEP_SEQUENCES_SETUP.md       # ステップ配信セットアップガイド
└── vercel.json                   # Vercel設定
```

---

## 🎯 ステップ配信機能

### 主な特徴

- **カスタマイズ可能な配信タイミング**
  - 即時配信（登録直後）
  - n分後（例: 30分後）
  - n時間後（例: 1時間後、2時間後）
  - n日後（例: 3日後）
  - 時刻指定（例: 毎日10:00）

- **管理画面から簡単設定**
  - ステップ配信シーケンスの作成・編集・削除
  - 各ステップの通知内容を自由にカスタマイズ
  - 有効/無効の切り替え

- **自動実行**
  - 新規ユーザー登録時に自動的にステップ配信開始
  - Vercel Cronで5分ごとに自動配信
  - 進捗管理とログ記録

### 使用例

#### 例1: 新規登録ウェルカムシリーズ

```
ステップ1: 即時配信
「ようこそ！ご登録ありがとうございます」

ステップ2: 30分後
「使い方ガイド: アプリの基本機能をご紹介」

ステップ3: 1時間後
「おすすめ機能: こんな便利な使い方があります」

ステップ4: 2時間後
「活用のコツ: より効果的に使うためのヒント」
```

#### 例2: 毎日の定期配信

```
ステップ1: 即時配信
「登録完了！明日から毎朝10時にお届けします」

ステップ2: 毎日10:00
「今日のおすすめ情報」
```

詳細は `STEP_SEQUENCES_SETUP.md` を参照してください。

---

## ⚙️ Vercel Cronジョブ

| エンドポイント | スケジュール | 説明 |
|---------------|-------------|------|
| `/api/cron/send-scheduled` | `0 0 * * *` | 毎日0時に予約通知を送信 |
| `/api/cron/send-step-notifications` | `*/5 * * * *` | 5分ごとにステップ配信を実行 |

※ステップ配信は5分ごとに実行されますが、Vercel Hobby プランでは制限があります。Proプラン推奨。

---

## 📊 データベース構成

### 基本テーブル

- `users` - ユーザートークン管理
- `notifications` - 通知予約管理

### ステップ配信テーブル

- `step_sequences` - ステップ配信シーケンス（シナリオ）管理
- `step_notifications` - 各ステップの通知設定
- `user_step_progress` - ユーザーごとの進捗管理
- `step_notification_logs` - 配信ログ

---

## 🔧 トラブルシューティング

### ステップ配信が送信されない場合

1. ✅ Supabaseでステップ配信テーブルが作成されているか確認
2. ✅ 環境変数 `VAPID_EMAIL` が設定されているか確認
3. ✅ Vercel Cronジョブが有効になっているか確認
4. ✅ シーケンスが「有効」になっているか確認

詳細は `STEP_SEQUENCES_SETUP.md` のトラブルシューティングセクションを参照。

---

## 📚 開発ドキュメント

詳細は `docs/` フォルダを参照してください：

- `01_プロジェクト概要・ディレクトリ構成.md`
- `02_技術スタック・環境構築手順.md`
- `03_データベース設計書.md`
- `04_API設計書.md`
- `05_画面仕様書.md`
- `06_FCM・ServiceWorker設計書.md`
- `07_通知送信フロー設計書.md`
- `08_開発タスク・スケジュール.md`

---

## ⚠️ 注意事項

- Web Push APIのVAPID設定は `lib/webpush.js` で管理
- Vercel Hobbyプランでは高頻度のcronに制限あり（Proプラン推奨）
- iOS PWAモードでのみWeb Push通知が動作
- ステップ配信の時刻指定はUTCで管理されます

---

## 📝 ライセンス

MIT License

---

## 🎉 完成！

これで PWA × Web Push × ステップ配信システムが完成しました！
管理画面から自由にステップ配信を設定して、ユーザーエンゲージメントを高めましょう。
