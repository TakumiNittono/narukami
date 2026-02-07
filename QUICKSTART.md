# ステップ配信機能 - クイックスタートガイド

## 📋 作成されたファイル一覧

### データベース
- ✅ `supabase_step_sequences_setup.sql` - ステップ配信用テーブル作成SQL

### フロントエンド（管理画面）
- ✅ `public/admin/sequences.html` - ステップ配信一覧画面
- ✅ `public/admin/sequences-create.html` - ステップ配信作成画面

### APIエンドポイント
- ✅ `api/step-sequences/list.js` - シーケンス一覧取得
- ✅ `api/step-sequences/create.js` - シーケンス作成
- ✅ `api/step-sequences/toggle.js` - 有効/無効切り替え
- ✅ `api/step-sequences/delete.js` - シーケンス削除
- ✅ `api/cron/send-step-notifications.js` - ステップ配信実行Cronジョブ

### 更新されたファイル
- ✅ `api/register-token.js` - ユーザー登録時にステップ配信を自動開始
- ✅ `public/admin/index.html` - ステップ配信管理へのリンクを追加
- ✅ `vercel.json` - Cronジョブとルーティング設定を追加
- ✅ `.env.example` - VAPID_EMAIL を追加
- ✅ `README.md` - ステップ配信の説明を追加

### ドキュメント
- ✅ `STEP_SEQUENCES_SETUP.md` - 詳細セットアップガイド
- ✅ `QUICKSTART.md` - このファイル

---

## 🚀 5分でセットアップ

### ステップ1: データベーステーブルを作成（2分）

1. Supabase ダッシュボードにログイン
2. SQL Editor を開く
3. `supabase_step_sequences_setup.sql` の内容をコピー＆ペースト
4. 実行ボタンをクリック

### ステップ2: 環境変数を確認（1分）

`.env.local` ファイルに以下が設定されていることを確認:

```bash
VAPID_EMAIL=your-email@example.com  # ← これを追加
```

まだ設定していない場合は追加してください。

### ステップ3: Vercelにデプロイ（2分）

```bash
# Gitにコミット
git add .
git commit -m "Add step notification feature"
git push origin main
```

Vercelが自動的にデプロイします。

#### Vercel環境変数を確認

Vercelダッシュボードで `VAPID_EMAIL` が設定されているか確認してください。
まだの場合は追加してください。

---

## ✅ 動作確認（5分）

### 1. 管理画面にアクセス

```
https://your-domain.vercel.app/admin
```

パスワードを入力してログイン。

### 2. ステップ配信を作成

1. **📊 ステップ配信管理** ボタンをクリック
2. **+ 新規ステップ配信作成** をクリック
3. 以下のテスト用シーケンスを作成:

**シーケンス名**: テスト配信
**説明**: 動作確認用

**ステップ1**:
- タイトル: ようこそ！
- 本文: 登録ありがとうございます
- タイミング: 即時配信

**ステップ2**:
- タイトル: 1分後のメッセージ
- 本文: 1分経過しました
- タイミング: n分後 → 1

**ステップ3**:
- タイトル: 5分後のメッセージ
- 本文: 5分経過しました
- タイミング: n分後 → 5

4. **作成する** ボタンをクリック

### 3. 新規ユーザー登録でテスト

1. シークレットモードで PWA を開く
2. 通知許可を承認
3. 即座にステップ1の通知が届く ✅
4. 1分後にステップ2の通知が届く ✅
5. 5分後にステップ3の通知が届く ✅

### 4. Supabaseで進捗を確認

Supabaseダッシュボードで以下のテーブルを確認:

- `user_step_progress` - 進捗が記録されている
- `step_notification_logs` - 送信ログが記録されている

---

## 🎯 実際の使用例

### ウェルカムシリーズ

```
シーケンス名: 新規登録ウェルカムシリーズ

ステップ1: 即時配信
「ようこそ！ご登録ありがとうございます」

ステップ2: 30分後
「使い方ガイド: アプリの基本機能」

ステップ3: 1時間後
「おすすめ機能のご紹介」

ステップ4: 24時間後（1日後）
「初日のまとめとヒント」
```

### 毎日の定期配信

```
シーケンス名: 毎日のおすすめ情報

ステップ1: 即時配信
「登録完了！明日から毎朝10時にお届けします」

ステップ2: 毎日10:00（時刻指定）
「今日のおすすめ情報」

※ステップ2は毎日繰り返されます
```

---

## 🔍 トラブルシューティング

### 通知が届かない場合

1. **Supabaseでテーブルを確認**
   ```sql
   -- ステップ配信が有効か確認
   SELECT * FROM step_sequences WHERE is_active = true;
   
   -- 進捗が作成されているか確認
   SELECT * FROM user_step_progress;
   ```

2. **Vercel Cronジョブを確認**
   - Vercelダッシュボード > Settings > Cron Jobs
   - `/api/cron/send-step-notifications` が `*/5 * * * *` で設定されているか確認

3. **環境変数を確認**
   - `VAPID_EMAIL` が設定されているか確認

4. **ログを確認**
   - Vercelダッシュボード > Deployments > Functions
   - `send-step-notifications` のログを確認

### 時刻指定が正しく動作しない場合

Vercel Cronは **UTC** で実行されます。

- 日本時間（JST）の10:00 = UTC の 01:00
- `scheduled_time` には UTC での時刻を指定してください

例:
- 日本時間の10:00 に配信したい場合 → `01:00:00` と入力
- 日本時間の20:00 に配信したい場合 → `11:00:00` と入力

---

## 📚 さらに詳しく

詳細なセットアップ手順、データベース設計、API仕様については以下を参照:

- `STEP_SEQUENCES_SETUP.md` - 詳細セットアップガイド
- `README.md` - プロジェクト全体の概要
- `docs/` - 開発ドキュメント一式

---

## 🎉 完了！

これでステップ配信機能が使えるようになりました！
管理画面から自由にステップ配信を作成して、ユーザーエンゲージメントを高めましょう。

質問やサポートが必要な場合は、`STEP_SEQUENCES_SETUP.md` のトラブルシューティングセクションを確認してください。
