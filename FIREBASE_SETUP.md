# Firebase Cloud Messaging API 有効化手順

## エラー: "Request is missing required authentication credential"

このエラーは、Firebase Cloud Messaging APIが有効になっていない場合に発生します。

## 解決方法

### 1. Firebase ConsoleからGoogle Cloud Consoleにアクセス（推奨）

**Firebase Consoleと同じアカウントでアクセスできます：**

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクト `pwanarukami` を選択
3. プロジェクト設定（⚙️）→ 全般タブ
4. 「Google Cloud でプロジェクトを開く」または「Google Cloud Console で開く」リンクをクリック
5. これで同じアカウントでGoogle Cloud Consoleにアクセスできます

### 2. Google Cloud ConsoleでAPIを有効化

1. Google Cloud Consoleで「APIとサービス」→「ライブラリ」を開く
2. 「Firebase Cloud Messaging API」を検索
3. 「有効にする」をクリック

### 3. 直接URLでアクセス（同じアカウントで）

Firebase Consoleにログインした状態で、以下のURLにアクセス：
```
https://console.cloud.google.com/apis/library/fcm.googleapis.com?project=pwanarukami
```

これで同じアカウントでAPIを有効化できます。

### 2. Firebase Consoleで確認

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクト `pwanarukami` を選択
3. プロジェクト設定 → Cloud Messaging タブ
4. 「Firebase Cloud Messaging API (V1)」が「有効」になっているか確認

### 3. APIキーの制限を確認

1. Google Cloud Console → 「APIとサービス」→「認証情報」
2. APIキー `AIzaSyAA-bPkKybAiAqWcTPt2oDp8Gfo5L-9IIc` をクリック
3. 「APIの制限」で「Firebase Cloud Messaging API」が許可されているか確認
4. または「制限なし」になっているか確認

## manifest.json の401エラーについて

これはVercelのアクセス制限がかかっている可能性があります。

### 確認ポイント

1. Vercel Dashboard → プロジェクト → Settings → Deployment Protection
2. 「Password Protection」が無効になっているか確認
3. プロダクション環境にデプロイメントが確定されているか確認
