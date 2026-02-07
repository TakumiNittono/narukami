# ステップ配信機能セットアップガイド

このガイドでは、ステップ配信機能を有効にするための手順を説明します。

## 📋 目次

1. [データベースのセットアップ](#1-データベースのセットアップ)
2. [環境変数の確認](#2-環境変数の確認)
3. [Vercelへのデプロイ](#3-vercelへのデプロイ)
4. [動作確認](#4-動作確認)

---

## 1. データベースのセットアップ

### 1.1 Supabaseダッシュボードでテーブルを作成

1. Supabaseダッシュボード (https://app.supabase.com/) にログイン
2. プロジェクトを選択
3. 左サイドバーから **SQL Editor** を選択
4. 以下のSQLファイルの内容をコピーして実行

```sql
-- supabase_step_sequences_setup.sql の内容を実行してください
```

または、ローカルのSQLファイルを使用:

```bash
# SQLファイルの内容をSupabaseで実行
cat supabase_step_sequences_setup.sql
```

### 1.2 テーブル作成の確認

以下のテーブルが作成されていることを確認してください:

- ✅ `step_sequences` - ステップ配信シーケンス管理
- ✅ `step_notifications` - 各ステップの通知設定
- ✅ `user_step_progress` - ユーザーごとの進捗管理
- ✅ `step_notification_logs` - 配信ログ
- ✅ `users` テーブルに `enrolled_at` と `step_sequence_id` カラムが追加されている

確認方法:
1. Supabaseダッシュボードの **Table Editor** を開く
2. 上記テーブルが表示されることを確認

---

## 2. 環境変数の確認

### 2.1 必要な環境変数

`.env.local` ファイルに以下の環境変数が設定されていることを確認:

```bash
# Web Push設定
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_EMAIL=your-email@example.com  # ← 新規追加（必須）

# Supabase設定
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxx
SUPABASE_ANON_KEY=sb_publishable_xxxxx

# 管理画面パスワード
ADMIN_PASSWORD=your-password

# Cron認証用シークレット
CRON_SECRET=your-random-secret-string
```

### 2.2 VAPID_EMAIL の設定

`VAPID_EMAIL` が未設定の場合は、管理者のメールアドレスを設定してください:

```bash
VAPID_EMAIL=admin@yourdomain.com
```

---

## 3. Vercelへのデプロイ

### 3.1 環境変数の設定

Vercelダッシュボードで環境変数を設定:

1. Vercelダッシュボード (https://vercel.com/) にアクセス
2. プロジェクトを選択
3. **Settings** > **Environment Variables** を開く
4. 以下の環境変数を追加（または確認）:

| 変数名 | 値 | 環境 |
|--------|-----|------|
| `VAPID_PUBLIC_KEY` | VAPIDの公開鍵 | Production, Preview, Development |
| `VAPID_PRIVATE_KEY` | VAPIDの秘密鍵 | Production, Preview, Development |
| `VAPID_EMAIL` | 管理者のメールアドレス | Production, Preview, Development |
| `SUPABASE_URL` | SupabaseのURL | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseのサービスロールキー | Production, Preview, Development |
| `ADMIN_PASSWORD` | 管理画面のパスワード | Production, Preview, Development |
| `CRON_SECRET` | Cron認証用のランダム文字列 | Production, Preview, Development |

### 3.2 デプロイ

```bash
# Gitにコミット
git add .
git commit -m "Add step notification feature"
git push origin main

# または Vercel CLIを使用
vercel --prod
```

### 3.3 Cronジョブの確認

デプロイ後、以下のCronジョブが設定されていることを確認:

1. Vercelダッシュボードのプロジェクトページを開く
2. **Settings** > **Cron Jobs** を確認

| エンドポイント | スケジュール | 説明 |
|---------------|-------------|------|
| `/api/cron/send-scheduled` | `0 0 * * *` | 毎日0時に予約通知を送信 |
| `/api/cron/send-step-notifications` | `*/5 * * * *` | 5分ごとにステップ配信を実行 |

---

## 4. 動作確認

### 4.1 管理画面でステップ配信を作成

1. 管理画面にアクセス: `https://your-domain.vercel.app/admin`
2. パスワードを入力してログイン
3. **📊 ステップ配信管理** ボタンをクリック
4. **+ 新規ステップ配信作成** をクリック

### 4.2 サンプルステップ配信を作成

以下のようなテスト用シーケンスを作成:

**シーケンス名**: テスト配信
**説明**: 動作確認用のテストシーケンス

**ステップ設定**:
- ステップ1: 即時配信（タイトル: ようこそ！）
- ステップ2: 1分後（タイトル: 1分後のメッセージ）
- ステップ3: 5分後（タイトル: 5分後のメッセージ）

### 4.3 新規ユーザー登録でテスト

1. 別のブラウザ（またはシークレットモード）で PWA を開く
2. 通知許可を承認してトークンを登録
3. 即座にステップ1の通知が届くことを確認
4. 1分後、5分後にそれぞれの通知が届くことを確認

### 4.4 管理画面で進捗を確認

Supabaseダッシュボードで以下を確認:

1. **user_step_progress** テーブル
   - 新規ユーザーの進捗レコードが作成されている
   - `current_step` が 0 → 1 → 2 → 3 と進んでいる
   - `next_notification_at` が次の配信予定時刻になっている

2. **step_notification_logs** テーブル
   - 各ステップの送信ログが記録されている
   - `success` が `true` になっている

---

## 🎯 使用例

### 例1: 新規登録ウェルカムシリーズ

```
ステップ1: 即時配信
「ようこそ！ご登録ありがとうございます」

ステップ2: 30分後
「使い方ガイド: アプリの基本機能をご紹介」

ステップ3: 1時間後
「おすすめ機能: こんな便利な使い方があります」

ステップ4: 24時間後
「初日のまとめ: お役立ち情報をチェック」
```

### 例2: 毎日の定期配信

```
ステップ1: 即時配信
「登録完了！明日から毎朝10時にお届けします」

ステップ2: 毎日10:00
「今日のおすすめ情報」
※scheduled（時刻指定）を選択
```

---

## 🔍 トラブルシューティング

### Q1. ステップ配信が送信されない

**確認事項**:
- ✅ Supabaseでテーブルが正しく作成されている
- ✅ 環境変数 `VAPID_EMAIL` が設定されている
- ✅ Vercel Cronジョブが有効になっている
- ✅ シーケンスが「有効」になっている
- ✅ `user_step_progress` にレコードが作成されている

**対処法**:
```sql
-- user_step_progress の確認
SELECT * FROM user_step_progress WHERE completed = false;

-- 手動でCronをトリガー（テスト用）
-- Vercelダッシュボード > Deployments > Functions で確認
```

### Q2. 新規ユーザーが進捗に登録されない

**原因**: ユーザー登録APIが正しく動作していない

**確認事項**:
- ✅ `api/register-token.js` が更新されている
- ✅ Supabaseに接続できている
- ✅ 有効なステップ配信シーケンスが存在する

**対処法**:
```sql
-- 有効なシーケンスを確認
SELECT * FROM step_sequences WHERE is_active = true;
```

### Q3. 時刻指定配信が正しい時間に送信されない

**原因**: タイムゾーンの問題

**対処法**:
- Vercel Cronは UTC で実行されます
- 日本時間（JST）の10:00は UTC の01:00です
- `scheduled_time` には UTC での時刻を指定してください

---

## 📚 関連ファイル

| ファイル | 説明 |
|---------|------|
| `supabase_step_sequences_setup.sql` | データベーステーブル作成SQL |
| `public/admin/sequences.html` | ステップ配信一覧画面 |
| `public/admin/sequences-create.html` | ステップ配信作成画面 |
| `api/step-sequences/list.js` | シーケンス一覧取得API |
| `api/step-sequences/create.js` | シーケンス作成API |
| `api/step-sequences/toggle.js` | シーケンス有効/無効切り替えAPI |
| `api/step-sequences/delete.js` | シーケンス削除API |
| `api/cron/send-step-notifications.js` | ステップ配信実行Cronジョブ |
| `api/register-token.js` | トークン登録API（ステップ配信開始処理を含む） |

---

## ✅ チェックリスト

セットアップが完了したら、以下の項目をチェックしてください:

- [ ] Supabaseで全てのテーブルが作成されている
- [ ] 環境変数 `VAPID_EMAIL` が設定されている
- [ ] Vercelにデプロイ済み
- [ ] Vercel Cronジョブが2つ設定されている
- [ ] 管理画面でステップ配信が作成できる
- [ ] 新規ユーザー登録で即時配信が届く
- [ ] 時間指定配信が正しく動作する
- [ ] Supabaseでログが記録されている

---

## 🎉 完了！

これでステップ配信機能が利用可能になりました。
管理画面から自由にステップ配信シーケンスを作成して、ユーザーエンゲージメントを高めましょう！

ご質問やサポートが必要な場合は、プロジェクトのドキュメントをご確認ください。
