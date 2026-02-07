# セットアップガイド

## Firebase設定の反映

### 1. Firebase Consoleから設定値を取得

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクト `pwanarukami` を選択
3. プロジェクト設定（⚙️）→ 全般タブ
4. 「アプリを追加」→ Webアイコン（</>）をクリック
5. 表示される `firebaseConfig` をコピー

### 2. js/app.js を更新

`js/app.js` の以下の部分を、Firebase Consoleから取得した値に置き換え：

```javascript
const firebaseConfig = {
    apiKey: "実際のAPIキー",  // ← Firebase Consoleから取得
    authDomain: "pwanarukami.firebaseapp.com",
    projectId: "pwanarukami",
    storageBucket: "pwanarukami.appspot.com",
    messagingSenderId: "実際のSender ID",  // ← Firebase Consoleから取得
    appId: "実際のApp ID"  // ← Firebase Consoleから取得
};
```

### 3. VAPID Keyの取得

1. Firebase Console → プロジェクト設定 → Cloud Messaging タブ
2. 「Web Push証明書」セクションの「Generate key pair」をクリック
3. 表示されるキーをコピー

### 4. js/app.js のVAPID Keyを更新

```javascript
const VAPID_KEY = "実際のVAPID Key";  // ← Cloud Messagingから取得
```

### 5. public/firebase-messaging-sw.js を更新

`public/firebase-messaging-sw.js` の `firebase.initializeApp()` 部分も同じ値に更新：

```javascript
firebase.initializeApp({
    apiKey: "実際のAPIキー",  // ← js/app.jsと同じ値
    authDomain: "pwanarukami.firebaseapp.com",
    projectId: "pwanarukami",
    storageBucket: "pwanarukami.appspot.com",
    messagingSenderId: "実際のSender ID",  // ← js/app.jsと同じ値
    appId: "実際のApp ID"  // ← js/app.jsと同じ値
});
```

## 環境変数の設定

### ローカル開発用 (.env.local)

`.env.local` ファイルを作成し、以下の内容を設定：

```bash
# Firebase設定（サービスアカウントJSONから取得済み）
FIREBASE_PROJECT_ID=pwanarukami
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@pwanarukami.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDkQBL/NMv0gotR\nyyJmMAE+BJbAmRdQTM1+HAWFt3gEEAHHKqjMNeGSkgFDJEqLga+SZ/vJhTRZieDF\nOojjnwTlJ4EL31GumBI1zEkuxJjCWwv96JFSLxMEnlh+2wEK+0qs9TkstePxO64O\n0JJhOxPpyhEfhgVnJ5dfNxq6U46Oh5NiE+zNE8H5LeY21OPIwL0/TGwYxFHZP76e\nQ42n07fVq9mpPCK3GL4kvF+CYeoJWsNFTAF5zflM7pQIt9Wij1GgjXqwTlaZrnDe\nWhrN0l0JlplhxnvM3kYtJz+gr+JqyAHVRQ6YhUrAUS3+AGeTkbo+OXS0f5WR7LHM\n0u3qD/GdAgMBAAECggEAAft2eXCYHDGtYRKjuVcjDkqpk9b13LTWDLQp7h0ySyK9\nHowwdsQ5scqtJ8v0Y8gcDL2fclgYT3YYQCOVKxjnSNAyLuFhIGQ3YEU7wM659DzT\nMADUO5j8usu0lrbIiF5h/yTgEBMs/XGDE6OHFJYX7a4GE7aCbIDBBUrWuMCKBT3Z\npvCNcGKYLWEMB/UZeZOuz9a3IFlSGuJezYnZPDqHqvuoRn0spNEsowdpwtreQyHa\nK2QTdzA53jBW/ZLcMY034AHd1BLDZiiEo8oMpIcgCYtQlE4zW3CmhnCJ+31yS6Zq\n8guQg3c+zNPon1uH8EVQ2ShHDmbCOOQzNqsFEjB25wKBgQD2RoTpJHQEreDNSebh\ntCMI42nz6IQrdw14wHXRyVeKeH3jfgAuE20kyBF/ggR9GF+VMYOVTa7ItwO/IrpG\nonqCb6hiEvYiw0/JfuPQ+IUNutDz+B9V3vdjUKmloAkJCZxfkOBuKIoDszbferJ2\nZ4YO+Tp+lBeTwgnVcHtOFOyRYwKBgQDtQ1jezgQDLAP5Nsjugr3DkRivCGTT6BeT\npPz8097zViL5xrsb2VnVsOdj0QE+KfoR20zMKBAFmEw0ENyau/quGwwAR1H+Mult\nSbZpqG2qKYG/q7g92rUzezv3/lwh02TJtu7CAeTRoCl4v1snAo0m+KBpVvznW4DC\n7rc+vGJg/wKBgDxqDj7XR3LCaOxTXcUumI2cpChGeO3ktbRSmlSNbOE2L8O37Dlh\nYJvuTISYE5vQd9o0nE/rD56DbvLbhRDA2QbYd1kfx6u9d/w5GY/w90rn8kx3KNC6\n8rs1VXig6raB2g+DjdrYLQs9Uo++HLt5J+TSdOwKTkJcDmeCwWzlKyd7AoGAW9YA\nlSUa6ntkAleRSLi0aPlFm6JdHKSuU4i+H8KGfputqA6jJ/FmU09JERq6J2yqDbVb\nsX4kTXYYsOKB8SanrjJr38O7WfAs6A9rGtSFtiKgxSbbhp2cG5Qsrx32XWVskqNL\nIS8IeZdL1iADUUMsjZQYyw1PkOGbIlix9weF8NMCgYB3iK0/xpyRlE8Pn6vvN006\naMk1dKLFIHYc8CCfqvxaPslKhWenuumxDI/wzPZp6HOqujdKmnGbhIEsKL/KZwCo\nqGk5mIAwQnKGgWJ9smqYdzYieM0cMNmWCQDVFyL0HK1ULKJD90VQEhmWrtD49hnY\n3Q0Bgy/44PBoQex0kM8nFA==\n-----END PRIVATE KEY-----\n"

# Supabase設定（Supabaseダッシュボードから取得）
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 管理画面パスワード
ADMIN_PASSWORD=1030

# Cron認証用シークレット（ランダムな文字列）
CRON_SECRET=your-random-secret-string-here
```

### Vercel本番環境用

Vercelダッシュボード → プロジェクト設定 → Environment Variables で以下を設定：

- `FIREBASE_PROJECT_ID` = `pwanarukami`
- `FIREBASE_CLIENT_EMAIL` = `firebase-adminsdk-fbsvc@pwanarukami.iam.gserviceaccount.com`
- `FIREBASE_PRIVATE_KEY` = （上記のprivate_keyをそのまま貼り付け、改行は `\n` のまま）
- `SUPABASE_URL` = （Supabaseから取得）
- `SUPABASE_SERVICE_ROLE_KEY` = （Supabaseから取得）
- `SUPABASE_ANON_KEY` = （Supabaseから取得）
- `ADMIN_PASSWORD` = `1030`
- `CRON_SECRET` = （ランダムな文字列）

## 次のステップ

1. ✅ FirebaseサービスアカウントJSON情報 → `.env.example` に反映済み
2. ⏳ Firebase Consoleから `firebaseConfig` と `VAPID_KEY` を取得
3. ⏳ `js/app.js` と `public/firebase-messaging-sw.js` を更新
4. ⏳ Supabaseプロジェクト作成・テーブル作成
5. ⏳ `.env.local` 作成
6. ⏳ `npm install` 実行
7. ⏳ `vercel dev` でローカル起動
