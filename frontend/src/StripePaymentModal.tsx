/**
 * @file StripePaymentModal.tsx
 * @description Stripe Secure Escrow Checkout Simulation UI Component
 * 3段階エスクロー取引に対応した、セキュアなクレジットカード決済フォームと
 * 通信遅延・トークン化プロセスの完全モックアップを実装するステートフルモーダルです。
 */

import React, { useState, useEffect, useRef } from "react";

/**
 * Stripe 決済モーダルのプロパティ
 */
interface StripePaymentModalProps {
  /** 支払総額（円） */
  price: number;
  /** 対象商品のタイトル */
  title: string;
  /** モーダルを閉じるコールバック */
  onClose: () => void;
  /** 決済成功時に発火する非同期コールバック (エスクロー登録) */
  onSuccess: () => Promise<void>;
}

export function StripePaymentModal({
  price,
  title,
  onClose,
  onSuccess
}: StripePaymentModalProps) {
  // --- クレジットカード入力ステート ---
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");

  // --- ローディング ＆ 成功ステート ---
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);

  // --- メモリリーク防止タイマー管理リファレンス ---
  const tokenizationTimerRef = useRef<any>(null);
  const successAnimationTimerRef = useRef<any>(null);

  /**
   * コンポーネントのアンマウント（急な離脱）時に、
   * バックグラウンドで実行中のすべての遅延タイマーを完全に強制終了（サニタイズ）します。
   */
  useEffect(() => {
    return () => {
      if (tokenizationTimerRef.current) clearTimeout(tokenizationTimerRef.current);
      if (successAnimationTimerRef.current) clearTimeout(successAnimationTimerRef.current);
    };
  }, []);

  /**
   * クレジットカード番号入力をリアルタイムで4桁ごとにスペース区切り整形します。
   * @param event 入力イベント
   */
  const handleCardNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = rawValue.match(/\d{4,16}/g);
    const firstMatch = (matches && matches[0]) || "";
    const formattedParts = [];

    for (let i = 0; i < firstMatch.length; i += 4) {
      formattedParts.push(firstMatch.substring(i, i + 4));
    }

    if (formattedParts.length > 0) {
      setCardNumber(formattedParts.join(" "));
    } else {
      setCardNumber(rawValue);
    }
  };

  /**
   * 有効期限入力をリアルタイムで「MM/YY」形式へスラッシュ補完します。
   * @param event 入力イベント
   */
  const handleExpiryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = event.target.value.replace(/[^0-9]/g, "");
    if (rawDigits.length > 2) {
      setExpiry(rawDigits.substring(0, 2) + "/" + rawDigits.substring(2, 4));
    } else {
      setExpiry(rawDigits);
    }
  };

  /**
   * クレジットカード決済処理シミュレーションを実行します。
   * @param event フォーム送信イベント
   */
  const handlePaySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cardNumber || !expiry || !cvc || !name) {
      alert("すべてのクレジットカード情報を入力してください。");
      return;
    }
    setPaying(true);

    // [手順 1]: Stripe セキュアゲートウェイへのネットワークトークン化リクエストを再現 (1.8秒遅延)
    tokenizationTimerRef.current = setTimeout(() => {
      setPaying(false);
      setSuccess(true);

      // [手順 2]: 支払い完了のチェックマーク演出が終了するまで待機 (1.2秒遅延)
      successAnimationTimerRef.current = setTimeout(() => {
        onSuccess();
      }, 1200);
    }, 1800);
  };

  // 入力されたカード番号からカードブランド（VISA / Mastercard）を動的に推測
  const isVisa = cardNumber.startsWith("4");
  const isMaster = cardNumber.startsWith("5");

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100, padding: "20px" }}>
      <div style={{ background: "#ffffff", borderRadius: "16px", border: "1px solid #cbd5e1", padding: "32px", width: "100%", maxWidth: "480px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", position: "relative", display: "flex", flexDirection: "column", gap: "24px", color: "#1f2937" }}>
        
        {/* モーダルヘッダー */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a", fontWeight: 700 }}>💳 Stripe 安全クレジットカード決済</h3>
            <small style={{ color: "#64748b" }}>購入商品: {title}</small>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", color: "#94a3b8", cursor: "pointer" }} disabled={paying || success}>✕</button>
        </div>

        {success ? (
          /* 決済成功画面（チェックマーク＆エスクロー保護の案内） */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: "16px", textAlign: "center" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#ecfdf5", border: "2px solid #34d399", display: "flex", alignItems: "center", justifyContent: "center", color: "#34d399", fontSize: "32px", animation: "sparkleGlow 1s infinite alternate" }}>✓</div>
            <strong style={{ fontSize: "20px", color: "#065f46" }}>お支払いが完了しました！</strong>
            <p style={{ margin: 0, color: "#047857", fontSize: "14px" }}>
              Stripeセキュリティ保護が適用されました。<br />
              代金は取引完了までエスクローに安全に保護されます。
            </p>
          </div>
        ) : paying ? (
          /* ネットワーク処理中ローディング */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: "16px", textAlign: "center" }}>
            <div className="updating-spinner" style={{ fontSize: "40px" }}>⏳</div>
            <strong style={{ fontSize: "16px", color: "#334155" }}>Stripe Secure Gateway で決済を処理中...</strong>
            <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
              カード番号の安全トークン化および与信審査を行っています。<br />
              画面を閉じずにそのままお待ちください。
            </p>
          </div>
        ) : (
          /* カード情報入力フォーム */
          <form onSubmit={handlePaySubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* 動的カードプレビュー */}
            <div style={{ 
              background: isVisa ? "linear-gradient(135deg, #1e3a8a, #3b82f6)" : isMaster ? "linear-gradient(135deg, #374151, #111827)" : "linear-gradient(135deg, #475569, #1e293b)",
              borderRadius: "12px", 
              padding: "20px", 
              color: "#ffffff", 
              display: "flex", 
              flexDirection: "column", 
              justifyContent: "space-between", 
              height: "160px",
              boxShadow: "0 8px 16px rgba(0,0,0,0.15)",
              transition: "all 0.3s ease"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "1px", opacity: 0.8 }}>SECURE CARD</span>
                {isVisa && <strong style={{ fontSize: "18px", fontStyle: "italic" }}>VISA</strong>}
                {isMaster && <strong style={{ fontSize: "18px", fontStyle: "italic" }}>Mastercard</strong>}
                {!isVisa && !isMaster && <strong style={{ fontSize: "18px", fontStyle: "italic", opacity: 0.5 }}>CARD</strong>}
              </div>
              <strong style={{ fontSize: "20px", fontFamily: "monospace", letterSpacing: "2px", margin: "12px 0" }}>
                {cardNumber || "•••• •••• •••• ••••"}
              </strong>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <small style={{ display: "block", fontSize: "9px", opacity: 0.7 }}>CARDHOLDER</small>
                  <span style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase" }}>{name || "YOUR NAME"}</span>
                </div>
                <div>
                  <small style={{ display: "block", fontSize: "9px", opacity: 0.7 }}>EXPIRES</small>
                  <span style={{ fontSize: "13px", fontFamily: "monospace" }}>{expiry || "MM/YY"}</span>
                </div>
              </div>
            </div>

            {/* 入力フィールド群 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>カード番号</label>
                <input
                  type="text"
                  maxLength={19}
                  placeholder="4000 1234 5678 9010"
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>有効期限</label>
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={handleExpiryChange}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>CVC (セキュリティコード)</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="•••"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/[^0-9]/g, ""))}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>カード名義人 (ローマ字)</label>
                <input
                  type="text"
                  placeholder="TARO YAMADA"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", textTransform: "uppercase" }}
                  required
                />
              </div>
            </div>

            {/* 決済金額表示 & 決済実行ボタン */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px", marginTop: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "14px", color: "#475569" }}>支払合計額 (エスクロー保護)</span>
                <strong style={{ fontSize: "20px", color: "#0f172a" }}>¥{price.toLocaleString()}</strong>
              </div>
              <button
                type="submit"
                className="primary-button"
                style={{ width: "100%", background: "#34d399", color: "#ffffff", border: "none", padding: "14px", fontSize: "16px" }}
              >
                🔐 安全な決済を実行（Stripe認証）
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
