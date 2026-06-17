# Next Market 要件定義書

## プロダクト概要

AI を活用した次世代フリマアプリ。出品者の説明文作成支援・購入者の質問応答・出品禁止物の自動検出によって、安全で使いやすいフリマ体験を提供する。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Go 1.22 |
| フロントエンド | React 19 + Vite + TypeScript |
| DB | Cloud SQL for MySQL 8.0 |
| AI | OpenAI API（gpt-4o-mini） |
| インフラ | Cloud Run / Cloud Build / Artifact Registry（asia-northeast1） |
| フロントエンドホスティング | Vercel |
| GCPプロジェクト | term9-toshiie-shiom |

## 実装済み機能

- ユーザー登録・ログイン（JWT認証）
- 商品一覧・詳細・出品（画像URLのみ）
- 商品購入フロー（決済なし）
- いいね機能
- DM（会話・メッセージ）
- AI 商品説明自動生成
- AI 購入前質問応答

## 未実装機能と担当

### toshs 担当

#### 画像アップロード（優先度：高）
- Cloud Storage バケットへの直接アップロード
- 出品フォームに画像選択UIを追加
- バックエンド: `POST /api/upload` → 署名付きURL発行
- DBの `item_images` テーブルは既存

#### 商品検索・フィルター（優先度：中）
- キーワード検索（title, description）
- カテゴリ・価格帯フィルター
- `GET /api/items?q=&category=&min_price=&max_price=` にクエリパラメータ追加

#### UI改善（優先度：中）
- 商品カード画像のレイアウト整備
- エラーメッセージの日本語化
- ローディング状態の改善

---

### 新contributor 担当

#### 出品禁止物の自動検出（優先度：高）
- [x] 出品時にタイトル・説明文をAIで審査
- [x] 禁止ワード（刃物、医薬品等）をプロンプトで検出
- [x] 警告表示 or 出品ブロック
- [x] エンドポイント: `POST /api/ai/check-item`

#### AI 価格提案（優先度：中）
- [x] タイトル・カテゴリ・状態から適正価格をAIが提案
- [x] 出品フォームに「価格を提案してもらう」ボタン
- [x] エンドポイント: `POST /api/ai/suggest-price`

#### テスト整備（優先度：低）
- [x] バックエンドのユニットテスト（`*_test.go`）
- [ ] 主要APIのハンドラーテスト

## API 一覧（現行）

| メソッド | パス | 説明 |
|---|---|---|
| GET | /api/healthz | ヘルスチェック |
| POST | /api/auth/register | ユーザー登録 |
| POST | /api/auth/login | ログイン |
| GET | /api/items | 商品一覧 |
| POST | /api/items | 商品出品（要認証） |
| GET | /api/items/{id} | 商品詳細 |
| POST | /api/items/{id}/like | いいね切り替え（要認証） |
| POST | /api/items/{id}/purchase | 購入（要認証） |
| GET | /api/conversations | DM一覧（要認証） |
| POST | /api/conversations | DM作成（要認証） |
| GET | /api/conversations/{id}/messages | メッセージ一覧（要認証） |
| POST | /api/conversations/{id}/messages | メッセージ送信（要認証） |
| POST | /api/ai/generate-description | 説明文生成（要認証） |
| POST | /api/ai/ask | 商品質問（要認証） |
| POST | /api/ai/check-item | 出品禁止物チェック（要認証） |
| POST | /api/ai/suggest-price | 価格提案（要認証） |

## DB スキーマ（現行テーブル）

- `users` - ユーザー
- `items` - 商品
- `item_images` - 商品画像
- `likes` - いいね
- `purchases` - 購入履歴
- `conversations` - DM会話
- `messages` - DM本文
- `ai_generations` - AI生成ログ
- `item_moderations` - 出品審査ログ

## 環境変数

| 変数名 | 説明 |
|---|---|
| `DATABASE_DSN` | MySQL 接続文字列（Cloud Run: unix socket） |
| `DB_USER / DB_PASS / DB_NAME / INSTANCE_UNIX_SOCKET` | Cloud Run向け個別設定（DSNの代替） |
| `JWT_SECRET` | JWT署名シークレット |
| `OPENAI_API_KEY` | OpenAI APIキー |
| `OPENAI_MODEL` | モデル名（デフォルト: gpt-4o-mini） |
| `ALLOWED_ORIGIN` | CORSを許可するオリジン（VercelのURL） |
| `GCS_BUCKET` | 画像アップロード先のCloud Storageバケット名 |
| `GCS_CLIENT_EMAIL` | 署名付きURL発行に使うサービスアカウントメール |
| `GCS_PRIVATE_KEY` | 署名付きURL発行に使うサービスアカウント秘密鍵 |
| `PORT` | HTTPポート（デフォルト: 8080） |
