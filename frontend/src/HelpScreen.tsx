import React, { useState } from "react";
import { User, Item, Conversation, Message, PersonalStats } from "./types";

export function HelpScreen() {
  const [tab, setTab] = useState<"negotiate" | "barter" | "scene" | "suggest" | "dashboard">("negotiate");

  return (
    <section className="screen help-screen" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="admin-header" style={{ borderBottom: "2px solid #edeef5", paddingBottom: "16px" }}>
        <h2 className="section-title">💡 アプリ機能解説・技術ガイド</h2>
        <p style={{ margin: "4px 0 0 0", color: "#6b6d85", fontSize: "14px" }}>
          Next Market に搭載された最先端のAI機能と、独自のアルゴリズムシステムについて解説します。
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "24px", alignItems: "start" }}>
        {/* Sidebar Tabs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={() => setTab("negotiate")}
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #edeef5",
              background: tab === "negotiate" ? "#4F46E5" : "#ffffff",
              color: tab === "negotiate" ? "#ffffff" : "#1A1B2E",
              fontWeight: 600,
              fontSize: "14px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            🤖 AI代理交渉
          </button>
          <button
            onClick={() => setTab("barter")}
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #edeef5",
              background: tab === "barter" ? "#4F46E5" : "#ffffff",
              color: tab === "barter" ? "#ffffff" : "#1A1B2E",
              fontWeight: 600,
              fontSize: "14px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            🔄 AIわらしべ物々交換
          </button>
          <button
            onClick={() => setTab("scene")}
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #edeef5",
              background: tab === "scene" ? "#4F46E5" : "#ffffff",
              color: tab === "scene" ? "#ffffff" : "#1A1B2E",
              fontWeight: 600,
              fontSize: "14px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            📸 AI使用風景合成
          </button>
          <button
            onClick={() => setTab("suggest")}
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #edeef5",
              background: tab === "suggest" ? "#4F46E5" : "#ffffff",
              color: tab === "suggest" ? "#ffffff" : "#1A1B2E",
              fontWeight: 600,
              fontSize: "14px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            💡 商品説明・価格査定
          </button>
          <button
            onClick={() => setTab("dashboard")}
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #edeef5",
              background: tab === "dashboard" ? "#4F46E5" : "#ffffff",
              color: tab === "dashboard" ? "#ffffff" : "#1A1B2E",
              fontWeight: 600,
              fontSize: "14px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            📊 分析ダッシュボード
          </button>
        </div>

        {/* Tab Content Display */}
        <div style={{ background: "#ffffff", border: "2px solid #edeef5", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {tab === "negotiate" && (
            <>
              <h3 style={{ margin: 0, color: "#4F46E5" }}>🤖 AI Agent Price Negotiation（エージェント・フリマ）</h3>
              <p style={{ margin: 0, fontSize: "14px", color: "#6b6d85", lineHeight: "1.6" }}>
                「値下げ交渉、AIに丸投げしませんか？」をテーマに、買い手・売り手双方が代理AIエージェントに駆け引きを完全に委託できる次世代の交渉取引です。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #edeef5", paddingTop: "16px" }}>
                <strong>🚀 使い方・体験ステップ:</strong>
                <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", color: "#1A1B2E", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <li>商品を出品する際、「最低許容価格」と「交渉AIの性格（大阪商人、エリート、アニメキャラ）」を設定します。</li>
                  <li>他のユーザーがその商品の詳細ページを開き、<strong>「AI交渉購入」</strong>ボタンをクリックします。</li>
                  <li>予算と欲しい度を入力して交渉を開始すると、極秘交渉室にて両者のAIエージェントがタフな交渉を実況対話！</li>
                  <li>合意に達すると自動決済され、不成立なら交渉履歴が表示されます。</li>
                </ol>
              </div>
              <div style={{ background: "#f7f8fc", padding: "16px", borderRadius: "8px", fontSize: "13px", color: "#6b6d85", borderLeft: "4px solid #4F46E5" }}>
                🛡️ <strong>技術的なハイライト (Backend / AI):</strong><br />
                Goで開発された自律交渉エンジンが、OpenAI（gpt-4o-mini）とマルチターン対話を行い、合意時に `SELECT FOR UPDATE` によるデータベースロック付きトランザクションを走らせ、安全に売却を確定させます。
              </div>
            </>
          )}

          {tab === "barter" && (
            <>
              <h3 style={{ margin: 0, color: "#4F46E5" }}>🔄 Barter Loop（AIマルチホップ物々交換プラットフォーム）</h3>
              <p style={{ margin: 0, fontSize: "14px", color: "#6b6d85", lineHeight: "1.6" }}>
                お金を使わない物々交換。ユーザー間の「売りたい（手放したい）もの」と「欲しいジャンル」の依存関係をAIが自動検出し、3者以上の循環ループ（わらしべ長者ネットワーク）を自動検出します。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #edeef5", paddingTop: "16px" }}>
                <strong>🚀 使い方・体験ステップ:</strong>
                <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", color: "#1A1B2E", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <li>商品を出品する際、<strong>「物々交換を許可」</strong>にチェックを入れ、「最も欲しいカテゴリー（ジャンル）」を選択します。</li>
                  <li>待機ユーザーが2人以上集まると、バックグラウンドのAI走査が循環ループを検出し、マイページの「物々交換」タブに提案します。</li>
                  <li>3者の商品の市場価値の違いをAIが適正評価し、取引を完全に等価にするための「清算差額調整金」を算出します。</li>
                  <li>全員が提案を承認すると、3者間での複数人同時発送・受取チェックボードが有効になります。</li>
                </ol>
              </div>
              <div style={{ background: "#f7f8fc", padding: "16px", borderRadius: "8px", fontSize: "13px", color: "#6b6d85", borderLeft: "4px solid #4F46E5" }}>
                🛡️ <strong>技術的なハイライト (Algorithm / Graph):</strong><br />
                Goバックエンド内で、深さ優先探索（DFS）閉路検出アルゴリズムを実行し、検出したループに対してOpenAIが「プール内調整額の総和がちょうど0円（ゼロサム）」になるよう財務調停を行います。30分に1回の自動走査、およびバッチ効率化のための動的スキップ機能を搭載。
              </div>
            </>
          )}

          {tab === "scene" && (
            <>
              <h3 style={{ margin: 0, color: "#4F46E5" }}>📸 AI使用風景生成 (Scene Generation)</h3>
              <p style={{ margin: 0, fontSize: "14px", color: "#6b6d85", lineHeight: "1.6" }}>
                商品詳細ページで、商品写真とユーザーのプロフィール写真（アバター）をAIが自動合成し、ユーザーがその商品を使用しているカスタムライフスタイル写真を生成します。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #edeef5", paddingTop: "16px" }}>
                <strong>🚀 使い方・体験ステップ:</strong>
                <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", color: "#1A1B2E", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <li>マイページでプロフィール写真を登録（変更）します。</li>
                  <li>任意の商品の詳細ページを開き、下部の<strong>「AI使用風景を生成」</strong>ボタンをクリックします。</li>
                  <li>AI（DALL-E Image Edit）が、あなたと商品の写真をマージしたパーソナライズされた使用風景画像を生成し、永続化されます。</li>
                </ol>
              </div>
              <div style={{ background: "#f7f8fc", padding: "16px", borderRadius: "8px", fontSize: "13px", color: "#6b6d85", borderLeft: "4px solid #4F46E5" }}>
                🛡️ <strong>技術的なハイライト (Mime-Type Injection):</strong><br />
                OpenAI Image Edit APIが要求する正しいマルチパートフォーマットをGoバックエンドが手動ヘッダー構築（`textproto`）で生成し、`image/jpeg`, `image/png` などのMime-Typeを動的注入することで、不適合エラーを完全に回避。
              </div>
            </>
          )}

          {tab === "suggest" && (
            <>
              <h3 style={{ margin: 0, color: "#4F46E5" }}>💡 AI商品説明生成 & 適正価格査定</h3>
              <p style={{ margin: 0, fontSize: "14px", color: "#6b6d85", lineHeight: "1.6" }}>
                出品手続きを最も簡単にするため、商品名・カテゴリ・状態・メモから、AIが自動で売れやすい商品説明文を作成し、市場価値を推定して推奨価格・最低価格を自動セットします。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #edeef5", paddingTop: "16px" }}>
                <strong>🚀 使い方・体験ステップ:</strong>
                <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", color: "#1A1B2E", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <li>出品画面（Sell）で、商品名、カテゴリをワンタップでピル選択します。</li>
                  <li>状態と、AIに特に伝えてほしい特徴（軽い、美品など）をメモに入力します。</li>
                  <li><strong>「OpenAIで説明生成」</strong>をクリックすると商品説明が自動入力され、<strong>「価格を提案」</strong>をクリックすると適正価格と最低許容価格が自動セットされます。</li>
                </ol>
              </div>
              <div style={{ background: "#f7f8fc", padding: "16px", borderRadius: "8px", fontSize: "13px", color: "#6b6d85", borderLeft: "4px solid #4F46E5" }}>
                🛡️ <strong>技術的なハイライト (JSON Mode / Clamp):</strong><br />
                OpenAIの `response_format: json_object`（JSONモード）による確実な構造化データ抽出、および価格の上限・下限のブレを合理的な範囲内に丸める自動クランプ処理を Go 側で実施しています。
              </div>
            </>
          )}

          {tab === "dashboard" && (
            <>
              <h3 style={{ margin: 0, color: "#4F46E5" }}>📊 分析ダッシュボード ＆ 💳 Stripeエスクロー決済・物流シミュレーション</h3>
              <p style={{ margin: 0, fontSize: "14px", color: "#6b6d85", lineHeight: "1.6" }}>
                個人売上高やカテゴリ比率、プラットフォームKPIを一元管理する「ダブル・ダッシュボード」に加え、商用運用に不可欠な「Stripe決済 ＆ 取引ナビ・物流エスクロー保護システム」を完全再現しています。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #edeef5", paddingTop: "16px" }}>
                <strong>🚀 使い方・体験ステップ:</strong>
                <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", color: "#1A1B2E", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <li>商品を購入する際、実運用のStripe checkoutを模したクレジットカード決済モーダルが表示されます。ダミー情報を入力し「決済を実行」すると、代金は安全にプラットフォーム（エスクロープール）へ一時保管されます。</li>
                  <li>買い手・売り手双方向のDM（チャット）を開くと、最上部に「Stripe エスクロー取引ナビ」が自動出現！</li>
                  <li>売り手が「商品を発送したことを通知する」、買い手が荷物を確認後に「商品を受け取ったので取引を完了する」をタップすると、エスクロー保護が自動解除され、売上が出品者の「引き出し可能残高」へ確定反映されます。</li>
                  <li>マイページのマイ・ダッシュボードでは、「確定売上高」と「現在エスクロー預かり中の資金」を統合ウォレットとして動的に監視でき、銀行口座への出金申請（Connect自動送金）も行えます。</li>
                </ol>
              </div>
              <div style={{ background: "#f7f8fc", padding: "16px", borderRadius: "8px", fontSize: "13px", color: "#6b6d85", borderLeft: "4px solid #4F46E5" }}>
                🛡️ <strong>技術的なハイライト (C2C Escrow / State Machine):</strong><br />
                購入処理を `'paid'`（運営プール） ➔ `'shipped'`（配送中） ➔ `'completed'`（リリース完了）の3フェーズ状態遷移モデルとしてDB構築。クレジットカードの最初の桁（4はVisa、5はMastercard）を動的に検知し、カードフェイスのグラデーションを変更する高度なCSSとセキュア通信ローディングをフロントに搭載。
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
