/**
 * @file types.ts
 * @description Next Market - 共有ドメインモデル定義および汎用ヘルパーユーティリティ
 * バックエンド（Go/MySQL）のJSON構造体定義と100%連動した、型安全なTypeScript型インターフェースです。
 */

/**
 * システム内ユーザーのアカウント情報
 */
export interface User {
  /** ユーザー固有識別ID */
  id: number;
  /** 表示名 (プロフィール名) */
  name: string;
  /** 電子メールアドレス (小文字サニタイズ済) */
  email: string;
  /** システム権限ロール ('user' = 一般会員, 'admin' = プラットフォーム管理者) */
  role: "user" | "admin";
  /** プロフィール用アバター画像URL (HTTPSまたはGCSプロトコル形式) */
  avatarUrl: string;
}

/**
 * 出品中の商品（アイテム）の属性情報
 */
export interface Item {
  /** 商品固有識別ID */
  id: number;
  /** 出品者のユーザーID */
  sellerId: number;
  /** 出品者の名前 */
  sellerName: string;
  /** 出品者のプロフィール画像URL */
  sellerAvatarUrl: string;
  /** 出品者の過去取引における平均評価星数 (0.0 〜 5.0) */
  sellerRatingAvg: number;
  /** 出品者の受取評価レビューの総件数 */
  sellerRatingCount: number;
  /** 出品者の過去の総売却・取引実績件数 */
  sellerTxCount: number;
  /** 商品タイトル */
  title: string;
  /** 商品の詳細説明文 (Markdown表現をサポート) */
  description: string;
  /** 出品カテゴリー (例: 家電・スマホ, 衣服・ファッション, 本・ゲーム・エンタメ) */
  category: string;
  /** 出品希望価格 (円) */
  price: number;
  /** 交渉可能な最低売却許容限界価格（シークレットバッファ・購入者側には完全非公開） */
  minPrice: number;
  /** 代理AI交渉エージェントに搭載する交渉キャラクター・文体 */
  aiPersonality: "standard" | "osaka" | "cool" | "anime";
  /** 循環物々交換（わらしべ長者モード）への参加許可フラグ */
  barterEnabled: boolean;
  /** 物々交換時に最も交換を希望する相手商品のカテゴリー指定 */
  wantCategory: string;
  /** 商品の取引状況ステータス ('active' = 販売中, 'sold' = 決済済・配送中, 'hidden' = 非公開・下書き) */
  status: "active" | "sold" | "hidden";
  /** 商品の第一画像URL */
  imageUrl: string;
  /** この商品に対して付けられた「いいね！」の総数 */
  likeCount: number;
  /** 出品登録日時 */
  createdAt: string;
}

/**
 * 1対1のダイレクトメッセージ（DM）、およびエスクロー決済・物流の進捗を同期するチャットルーム
 */
export interface Conversation {
  /** 会話ルーム固有識別ID */
  id: number;
  /** 取引対象商品のID */
  itemId: number;
  /** 取引対象商品のタイトル */
  itemTitle: string;
  /** 取引対象商品の価格 */
  itemPrice: number;
  /** 取引対象商品の販売状況ステータス */
  itemStatus: "active" | "sold" | "hidden";
  /** 取引対象商品の画像URL */
  itemImageUrl: string;
  /** 取引対象商品のカテゴリー */
  itemCategory: string;
  /** チャットを開始したバイヤー（購入希望者）のID */
  buyerId: number;
  /** 商品を出品したセラー（販売者）のID */
  sellerId: number;
  /** 現在ログイン中のユーザーから見た「相手側」のユーザーID */
  counterpartId: number;
  /** 相手側の名前 */
  counterpartName: string;
  /** 相手側のアバター画像URL */
  counterpartAvatarUrl: string;
  /** 動的エスクロー決済が存在する場合の、 purchases テーブルの注文ID */
  purchaseId?: number;
  /** エスクロー決済取引の現在の物流ステータス ('paid' = 支払い完了・発送待ち, 'shipped' = 配送中・受取報告待ち, 'completed' = 取引完了・入金解放済) */
  purchaseStatus?: string;
  /** 最終スレッド更新日時 */
  updatedAt: string;
}

/**
 * 取引スレッド内のチャット発言（メッセージ）
 */
export interface Message {
  /** メッセージ固有ID */
  id: number;
  /** 所属する会話ルームのID */
  conversationId: number;
  /** 発言者のユーザーID */
  senderId: number;
  /** 発言メッセージ本文 (プレーンテキスト) */
  body: string;
  /** 送信日時 */
  createdAt: string;
}

/**
 * 取引完了時にバイヤーとセラーが相互に記入する受取評価レビュー
 */
export interface UserReview {
  id: number;
  purchaseId: number;
  itemId: number;
  itemTitle: string;
  reviewerId: number;
  reviewerName: string;
  revieweeId: number;
  revieweeName: string;
  /** 評価レート (1 〜 5 の5段階) */
  rating: number;
  /** 感謝のコメントまたはレビュー本文 */
  comment: string;
  createdAt: string;
}

/**
 * AIによって生成された、商品のアピール合成写真・動画
 */
export interface ItemScene {
  id: number;
  userId: number;
  itemId: number;
  /** ストレージバケット内の物理画像パス (gcs://) */
  imagePath: string;
  /** 変換済みのセキュアなHTTPS公開画像URL */
  imageUrl: string;
  /** 生成に使用されたプロンプトテキスト */
  prompt: string;
  /** ストレージバケット内の物理動画パス (gcs://) */
  videoPath: string;
  /** 変換済みのセキュアなHTTPS公開動画URL */
  videoUrl: string;
}

/**
 * シングルページアプリケーション(SPA)内における、型安全なクライアントサイドパス表現
 */
export type Route =
  | { page: "auth" }
  | { page: "home" }
  | { page: "sell" }
  | { page: "messages" }
  | { page: "mypage" }
  | { page: "item"; itemId: number }
  | { page: "admin"; subpage: "stats" | "moderations" | "users" }
  | { page: "help" };

/** 共通ナビゲーションバーの有効な遷移先 */
export type NavPage = "home" | "sell" | "messages" | "mypage" | "help";

export interface NavItem {
  page: NavPage;
  label: string;
  icon: any;
}

/**
 * 個人ダッシュボード向けにリアルタイム集計された分析データ
 */
export interface PersonalStats {
  summary: {
    /** 累計売上金額（円） */
    totalRevenue: number;
    /** 累計販売成立件数 */
    totalSales: number;
    /** 累計獲得「いいね！」数 */
    totalLikes: number;
    /** アクティブに出品している商品点数 */
    activeItems: number;
    /** すでに販売成立して売却済みになった商品点数 */
    soldCount: number;
    /** 獲得した受取評価の総件数 */
    reviewCount: number;
    /** 平均評価星数 (0.0 〜 5.0) */
    ratingAvg: number;
  };
  /** カテゴリー別のアクティブ出品割合 */
  categoryDistribution: { category: string; itemCount: number; totalValue: number }[];
  /** 最近30日間の日次売上推移 */
  dailyRevenue: { date: string; amount: number; txCount: number }[];
}

/**
 * 【ユーティリティ】GCSの内部ストレージパス(gcs://)を、ブラウザで安全に表示できる
 * 署名付き/公開HTTPSアドレス(https://storage.googleapis.com/)へ安全にマッピングします。
 * @param url 元のURL文字列
 * @returns 変換後の安全なHTTPS公開URL
 */
export function getPublicUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("gcs://")) {
    const cleanPath = url.replace("gcs://", "");
    return `https://storage.googleapis.com/${cleanPath}`;
  }
  return url;
}
