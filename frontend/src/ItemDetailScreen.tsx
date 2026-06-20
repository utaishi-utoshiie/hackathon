/**
 * @file ItemDetailScreen.tsx
 * @description Next Market - 商品詳細画面（ギャラリー、AI質問、AI風景・動画生成、代理AI交渉、Stripe決済連携）
 */

import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Bot, ImagePlus } from "lucide-react";
import { Item, ItemScene, User, getPublicUrl } from "./types";
import { StripePaymentModal } from "./StripePaymentModal";

// Local error cleaning helper
function cleanErrorMessage(err: any, fallback: string): string {
  if (!err) return fallback;
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg) return fallback;
  if (msg.includes("OpenAI") || msg.includes("api.openai.com") || msg.includes("quota") || msg.includes("502") || msg.includes("Bad Gateway") || msg.includes("Authorization")) {
    return "OpenAIのAPIキー設定が正しく完了していないか、一時的な利用制限に達しています。サーバーの環境変数設定をご確認ください。";
  }
  if (msg.includes("Unauthorized") || msg.includes("token") || msg.includes("401") || msg.includes("authorization required")) {
    return "セッションの有効期限が切れたか、ログイン情報が不正です。一度ログアウトし、再度ログインし直してお試しください。";
  }
  if (msg.includes("connection") || msg.includes("network") || msg.includes("dial tcp") || msg.includes("http")) {
    return "サーバーとのネットワーク接続に一時的なエラーが発生しました。インターネット回線をご確認の上、もう一度お試しください。";
  }
  if (msg.includes("Duplicate entry") || msg.includes("1062")) {
    return "すでに登録済みのデータ（重複）が存在します。画面上部の『⚡ デモデータを自動投入』をクリックして初期設定からやり直してください。";
  }
  return msg;
}

// Inline Markdown parsing/rendering component
function MarkdownBlock({ text, className }: { text: string; className?: string }) {
  const escapeHtml = (unsafe: string) => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const renderInline = (src: string) => {
    return src
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>");
  };

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      closeList();
      continue;
    }

    // Bullet List
    const bullet = line.match(/^[\*\-]\s+(.*)/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(escapeHtml(bullet[1]))}</li>`);
      continue;
    }

    closeList();

    // Headings
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    html.push(`<p>${renderInline(escapeHtml(line))}</p>`);
  }

  closeList();

  return <div className={className ? `markdown-block ${className}` : "markdown-block"} dangerouslySetInnerHTML={{ __html: html.join("\n") }} />;
}

interface ItemDetailScreenProps {
  item: Item | null;
  user: User | null;
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onBack: () => void;
  onChanged: (itemId: number) => void;
  onNotice: (message: string) => void;
  onConversationCreated: (conversationId: number) => Promise<void>;
  onCompleteStep?: (step: number) => void;
  autoPilot?: boolean;
  autoPilotStep?: number;
  onCompleteAutopilotStep?: (step: number) => void;
}

export function ItemDetailScreen({
  item,
  user,
  api,
  onBack,
  onChanged,
  onNotice,
  onConversationCreated,
  onCompleteStep,
  autoPilot,
  autoPilotStep,
  onCompleteAutopilotStep
}: ItemDetailScreenProps) {
  const [question, setQuestion] = useState("通勤用として雨の日にも使えそう？");
  const [answer, setAnswer] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAIError] = useState("");
  const [scene, setScene] = useState<ItemScene | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState("");

  // AI Video States
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoSimulated, setVideoSimulated] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);

  // Stripe Payment States
  const [showStripeModal, setShowStripeModal] = useState(false);

  // AI 3D Appraisal Scanner Modal State
  const [showAppraisal, setShowAppraisal] = useState(false);

  // Negotiation Modal States
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [buyerBudget, setBuyerBudget] = useState(item ? Math.round(item.price * 0.8) : 0);
  const [desireLevel, setDesireLevel] = useState<"low" | "medium" | "high">("medium");
  const [negotiating, setNegotiating] = useState(false);
  const [negotiationResult, setNegotiationResult] = useState<{
    status: "completed" | "failed";
    agreedPrice: number;
    dialogue: { speaker: "buyer" | "seller"; text: string; price: number; action: string }[];
  } | null>(null);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [negError, setNegError] = useState("");

  const timerRef = useRef<any>(null);
  const dialogueEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dialogueEndRef.current) {
      dialogueEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [dialogueIndex, negotiationResult]);

  // Autopilot Actions inside Item Detail
  useEffect(() => {
    if (!autoPilot) return;

    if (autoPilotStep === 4) {
      // Start the actual pricing negotiation simulation (which is step 4!)
      const timer = setTimeout(() => {
        void startNegotiation();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoPilot, autoPilotStep]);

  useEffect(() => {
    if (!autoPilot || autoPilotStep !== 9) return;

    const timer = setTimeout(() => {
      const runGenerations = async () => {
        try {
          await generateScene();
        } catch (e) {
          console.warn("Autopilot scene generation failed, continuing tour:", e);
        }

        // Wait 2.2s for display
        await new Promise((resolve) => setTimeout(resolve, 2200));

        try {
          await generateSceneVideo();
        } catch (e) {
          console.warn("Autopilot video generation failed, continuing tour:", e);
        }

        // Wait 5.5s for display
        await new Promise((resolve) => setTimeout(resolve, 5500));

        if (onCompleteAutopilotStep) onCompleteAutopilotStep(9);
      };

      void runGenerations();
    }, 1500);

    return () => clearTimeout(timer);
  }, [autoPilot, autoPilotStep]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showNegotiation) {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [showNegotiation]);

  useEffect(() => {
    setScene(null);
    setSceneError("");
    if (!user || !item) return;
    void loadLatestScene();
  }, [item?.id, user?.id]);

  if (!item) {
    return (
      <section className="page-shell">
        <section className="panel detail-panel">
          <p className="muted">商品が見つかりませんでした。</p>
          <button type="button" className="ghost-button" onClick={onBack}>
            ホームへ戻る
          </button>
        </section>
      </section>
    );
  }

  const currentItem = item;

  async function loadLatestScene() {
    try {
      const data = await api<{ scene: ItemScene | null }>(`/items/${currentItem.id}/ai-scene`);
      setScene(data.scene);
    } catch (err) {
      setSceneError(cleanErrorMessage(err, "AI画像の読み込みに失敗しました"));
    }
  }

  async function askAI() {
    setLoadingAI(true);
    setAIError("");
    setAnswer("");
    try {
      const data = await api<{ answer: string }>("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ itemId: currentItem.id, question })
      });
      setAnswer(data.answer);
    } catch (err) {
      setAIError(cleanErrorMessage(err, "AI回答の取得に失敗しました"));
    } finally {
      setLoadingAI(false);
    }
  }

  async function generateScene() {
    setSceneLoading(true);
    setSceneError("");
    try {
      const data = await api<{ scene: ItemScene }>(`/items/${currentItem.id}/ai-scene`, { method: "POST" });
      setScene(data.scene);
      setIsPlayingVideo(false);
      setVideoUrl("");
    } catch (err) {
      setSceneError(cleanErrorMessage(err, "AI画像の生成に失敗しました"));
    } finally {
      setSceneLoading(false);
    }
  }

  async function generateSceneVideo() {
    setVideoLoading(true);
    setVideoError("");
    setVideoUrl("");
    setIsPlayingVideo(false);
    try {
      const data = await api<{
        status: string;
        videoUrl: string;
        simulated: boolean;
      }>(`/items/${currentItem.id}/ai-video`, { method: "POST" });
      setVideoUrl(data.videoUrl);
      setVideoSimulated(data.simulated);
      setIsPlayingVideo(true);
      onNotice(data.simulated ? "映画風シネマグラフを生成しました！" : "AI動画の生成が完了しました！");
      if (onCompleteStep) onCompleteStep(3);
    } catch (err) {
      setVideoError(cleanErrorMessage(err, "AI動画の生成に失敗しました"));
    } finally {
      setVideoLoading(false);
    }
  }

  async function like() {
    await api(`/items/${currentItem.id}/like`, { method: "POST" });
    onNotice("いいねしました");
    onChanged(currentItem.id);
  }

  async function purchase() {
    setShowStripeModal(true);
  }

  async function executeSecureStripePayment() {
    await api(`/items/${currentItem.id}/purchase`, { method: "POST" });
    onNotice("Stripe決済が完了し、代金はエスクローに保護されました！");
    onChanged(currentItem.id);
  }

  async function messageSeller() {
    const data = await api<{ conversationId: number }>("/conversations", {
      method: "POST",
      body: JSON.stringify({ itemId: currentItem.id, sellerId: currentItem.sellerId })
    });
    onNotice(`会話を作成しました: #${data.conversationId}`);
    await onConversationCreated(data.conversationId);
  }

  const startNegotiation = async () => {
    setNegotiating(true);
    setNegError("");
    setNegotiationResult(null);
    setDialogueIndex(0);
    try {
      const data = await api<any>(`/items/${currentItem.id}/negotiate`, {
        method: "POST",
        body: JSON.stringify({ buyerBudget, desireLevel })
      });
      setNegotiationResult(data);

      let idx = 0;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        idx++;
        if (idx >= data.dialogue.length) {
          clearInterval(timerRef.current);
          if (data.status === "completed") {
            onNotice("代理AI交渉が合意成立し、自動で購入されました！");
            onChanged(currentItem.id);
          } else {
            onNotice("AI交渉が決裂しました。予算を調整して再交渉できます。");
          }
          if (onCompleteStep) onCompleteStep(1);
          if (autoPilot && onCompleteAutopilotStep) {
            setTimeout(() => {
              onCompleteAutopilotStep(4);
            }, 3000);
          }
        } else {
          setDialogueIndex(idx);
        }
      }, 1500);
    } catch (err) {
      setNegError(cleanErrorMessage(err, "代理交渉の開始に失敗しました"));
    } finally {
      setNegotiating(false);
    }
  };

  return (
    <section className="screen item-detail-screen">
      <div className="section-head">
        <button type="button" className="ghost-button" onClick={onBack}>← ホームへ戻る</button>
      </div>

      <section className="detail-layout">
        <article className="media-panel panel">
          <img className="hero-image" src={getPublicUrl(currentItem.imageUrl) || "/placeholder.svg"} alt="" />
        </article>

        <article className="panel detail-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <span className="detail-category">{currentItem.category}</span>
            <h2 className="detail-title">{currentItem.title}</h2>
            <p className="detail-price">¥{currentItem.price.toLocaleString()}</p>
            <button 
              type="button"
              className="ghost-button" 
              onClick={() => setShowAppraisal(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#eef0ff", color: "#4338ca", border: "1px solid #d7daf2", marginTop: "12px", padding: "8px 16px", borderRadius: "30px", fontWeight: "bold", fontSize: "12px", cursor: "pointer" }}
            >
              🔮 AI立体・AR査定を起動（3D空間解析）
            </button>
          </div>

          <div style={{ display: "flex", gap: "12px", borderTop: "1px solid #edeef5", borderBottom: "1px solid #edeef5", padding: "12px 0" }}>
            <span style={{ fontSize: "14px" }}>⭐ {currentItem.sellerRatingAvg.toFixed(1)} ({currentItem.sellerRatingCount}件の評価)</span>
            <span style={{ fontSize: "14px" }}>❤️ {currentItem.likeCount} いいね</span>
          </div>

          {/* Seller Trust Profile Badge Card */}
          <div style={{ 
            background: "#f7f8fc", 
            border: "1px solid #edeef5", 
            borderRadius: "12px", 
            padding: "16px", 
            display: "flex", 
            alignItems: "center", 
            gap: "16px" 
          }}>
            <img 
              src={getPublicUrl(currentItem.sellerAvatarUrl) || "./placeholder-avatar.svg"} 
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).src = "./placeholder-avatar.svg";
              }}
              style={{ width: "52px", height: "52px", borderRadius: "50%", border: "2px solid #edeef5", objectFit: "cover" }} 
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ fontSize: "15px", color: "#1A1B2E" }}>{currentItem.sellerName} さん</strong>
                <span style={{ background: "#ecfdf5", color: "#059669", fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  ✓ 本人確認済
                </span>
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", color: "#4b5563", fontWeight: 600 }}>
                  ⭐ {currentItem.sellerRatingAvg > 0 ? currentItem.sellerRatingAvg.toFixed(1) : "未評価"} 
                  <span style={{ color: "#9ca3af", fontWeight: "normal", marginLeft: "2px" }}>({currentItem.sellerRatingCount}件)</span>
                </span>
                <span style={{ fontSize: "12px", color: "#4b5563" }}>
                  🤝 取引実績: <strong style={{ color: "#4F46E5" }}>{currentItem.sellerTxCount}件</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="detail-actions">
            <button type="button" className="ghost-button" onClick={like}>❤️ いいねする</button>
            {user?.id !== currentItem.sellerId && currentItem.status === "active" && (
              <>
                <button type="button" className="primary-button" onClick={purchase}>💳 クレジットカードで購入する</button>
                <button type="button" className="primary-button" style={{ background: "linear-gradient(135deg, #4F46E5, #6366f1)" }} onClick={() => setShowNegotiation(true)}>
                  🤖 代理AI交渉で購入する
                </button>
                <button type="button" className="ghost-button" onClick={messageSeller}>💬 出品者とチャットする</button>
              </>
            )}
            {currentItem.status !== "active" && <span className="sold-badge">売却済み / 取引中</span>}
          </div>

          <div className="scene-grid">
            <section className="scene-card">
              <p className="eyebrow">Original</p>
              <img className="scene-image" src={getPublicUrl(currentItem.imageUrl) || "/placeholder.svg"} alt="" />
            </section>
            <section className="scene-card">
              <p className="eyebrow">AI Scene & Video</p>
              {!scene ? (
                <div className="scene-placeholder">あなた専用の使用イメージを生成できます</div>
              ) : isPlayingVideo ? (
                videoSimulated ? (
                  <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: "8px" }}>
                    <img
                      src={getPublicUrl(scene.imageUrl)}
                      alt=""
                      className="scene-image"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        animation: "kenBurns 10s infinite alternate ease-in-out"
                      }}
                    />
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", background: "radial-gradient(circle, transparent 40%, rgba(255,255,255,0.15) 80%)" }}></div>
                    <div className="sparkle" style={{ position: "absolute", top: "20%", left: "30%", width: "12px", height: "12px", background: "#fff", borderRadius: "50%", boxShadow: "0 0 10px #fff, 0 0 20px #ffccb8", animation: "sparkleGlow 3s infinite alternate ease-in-out" }}></div>
                    <div className="sparkle" style={{ position: "absolute", top: "60%", left: "70%", width: "8px", height: "8px", background: "#fff", borderRadius: "50%", boxShadow: "0 0 8px #fff, 0 0 16px #b3dcff", animation: "sparkleGlow 2.5s infinite alternate ease-in-out", animationDelay: "0.8s" }}></div>
                    <div className="sparkle" style={{ position: "absolute", top: "40%", left: "80%", width: "10px", height: "10px", background: "#fff", borderRadius: "50%", boxShadow: "0 0 8px #fff, 0 0 16px #ffefe9", animation: "sparkleGlow 3.5s infinite alternate ease-in-out", animationDelay: "1.5s" }}></div>
                  </div>
                ) : (
                  <video src={videoUrl} autoPlay loop muted playsInline className="scene-image" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
                )
              ) : (
                <img className="scene-image" src={getPublicUrl(scene.imageUrl)} alt="" style={{ borderRadius: "8px" }} />
              )}
            </section>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "12px" }}>
            <button type="button" className="ai-button" disabled={!user || sceneLoading} onClick={() => void generateScene()} style={{ flex: 1 }}>
              <ImagePlus size={18} />
              {sceneLoading ? "生成中..." : scene ? "AI画像再生成" : "AI画像を生成"}
            </button>
            {scene && (
              <button type="button" className="ai-button" disabled={!user || videoLoading} onClick={isPlayingVideo ? () => setIsPlayingVideo(false) : () => void generateSceneVideo()} style={{ flex: 1, background: isPlayingVideo ? "#edeef5" : "#4F46E5", color: isPlayingVideo ? "#1A1B2E" : "#ffffff", borderColor: isPlayingVideo ? "#edeef5" : "#4F46E5" }}>
                <Bot size={18} />
                {videoLoading ? "動画生成中..." : isPlayingVideo ? "⏹️ 再生停止" : "🎬 AI動画を生成・再生"}
              </button>
            )}
          </div>
          {sceneError && <p className="error">{sceneError}</p>}
          {videoError && <p className="error">{videoError}</p>}
          <div className="panel-heading">
            <Bot size={20} />
            <h3>AIに質問</h3>
          </div>
          <div className="ai-ask">
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} />
            <button type="button" className="ai-button" disabled={loadingAI} onClick={askAI}>
              <Bot size={18} />
              {loadingAI ? "回答中" : "AIに質問"}
            </button>
            {aiError && <p className="error">{aiError}</p>}
            {answer && <MarkdownBlock className="ai-answer" text={answer} />}
          </div>
        </article>
      </section>

      {showStripeModal && (
        <StripePaymentModal
          price={currentItem.price}
          title={currentItem.title}
          onClose={() => setShowStripeModal(false)}
          onSuccess={async () => {
            await executeSecureStripePayment();
            setShowStripeModal(false);
          }}
        />
      )}

      {(showNegotiation || (autoPilot && (autoPilotStep === 3 || autoPilotStep === 4))) && (
        <div className="negotiation-modal-backdrop" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div className="negotiation-modal-content" style={{ background: "#ffffff", borderRadius: "12px", border: "2px solid #edeef5", padding: "24px", width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #edeef5", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={20} style={{ color: "#4F46E5" }} />
                <h3 style={{ margin: 0, color: "#1A1B2E" }}>AI代理価格交渉（エージェント・フリマ）</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => { setShowNegotiation(false); setNegotiationResult(null); }} style={{ padding: "4px" }}>✕</button>
            </div>

            {!negotiationResult && !negotiating ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <p style={{ margin: 0, color: "#6b6d85", fontSize: "14px", lineHeight: "1.5" }}>
                  「希望予算」と「欲しい度」を設定して、あなたの代理AIエージェントに値下げ交渉を任せましょう。<br />
                  出品者側の代理AI（性格：<strong>{item.aiPersonality === "osaka" ? "コテコテの大阪商人" : item.aiPersonality === "cool" ? "冷静沈着エリート" : item.aiPersonality === "anime" ? "元気でかわいいアニメキャラ" : "標準・丁寧"}</strong>）と自律的にチャット交渉を行い、合意すれば自動で購入が確定します！
                </p>
                <div className="two-col" style={{ display: "grid", gap: "16px", gridTemplateColumns: "1fr 1fr" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#1A1B2E" }}>希望購入価格（予算）</label>
                    <input value={buyerBudget} onChange={(e) => setBuyerBudget(Number(e.target.value))} type="number" style={{ width: "100%" }} />
                    <small style={{ color: "#9698ab" }}>出品価格: ¥{item.price.toLocaleString()}</small>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#1A1B2E" }}>どうしても欲しい度</label>
                    <select value={desireLevel} onChange={(e: any) => setDesireLevel(e.target.value)}>
                      <option value="low">普通（予算を厳守）</option>
                      <option value="medium">強め（予算の5%超過まで許容）</option>
                      <option value="high">絶対欲しい（予算の10%超過まで許容）</option>
                    </select>
                  </div>
                </div>
                <button type="button" className="primary-button" onClick={() => void startNegotiation()} style={{ padding: "14px", marginTop: "8px" }}>
                  🤖 代理AI交渉を開始する
                </button>
                {negError && <p className="error" style={{ marginTop: "12px", color: "#ef4444", fontSize: "13px", fontWeight: "600", textAlign: "center" }}>{negError}</p>}
              </div>
            ) : negotiating ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: "16px" }}>
                <div className="updating-spinner" style={{ fontSize: "36px" }}>🤖</div>
                <strong style={{ fontSize: "16px", color: "#1A1B2E" }}>AIエージェント間で自律価格交渉中（1ターンシミュレート）...</strong>
                <p style={{ margin: 0, color: "#9698ab", fontSize: "13px", textAlign: "center" }}>
                  お互いのシークレット条件（予算 vs 最低売却許容価格）を突き合わせ、<br />
                  落としどころを探っています。しばらくお待ちください。
                </p>
              </div>
            ) : (
              (() => {
                const res = negotiationResult!;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ background: res.status === "completed" ? "#ecfdf5" : "#fff5f5", border: res.status === "completed" ? "1px solid #a7f3d0" : "1px solid #feb2b2", borderRadius: "8px", padding: "16px", textAlign: "center" }}>
                      <strong style={{ fontSize: "18px", color: res.status === "completed" ? "#065f46" : "#991b1b" }}>
                        {res.status === "completed" ? `🎉 交渉成立！ 合意価格: ¥${res.agreedPrice.toLocaleString()}` : "❌ 交渉決裂"}
                      </strong>
                      <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: res.status === "completed" ? "#047857" : "#9b1c1c" }}>
                        {res.status === "completed" ? "Stripeエスクロー決済が自動で実行されました。" : "お互いの希望条件が折り合いませんでした。"}
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "40vh", overflowY: "auto", padding: "10px", border: "1px solid #edeef5", borderRadius: "8px", background: "#f7f8fc" }}>
                      {res.dialogue.slice(0, dialogueIndex + 1).map((chat, i) => (
                        <div key={i} className={`chat-bubble-anim ${chat.speaker === "buyer" ? "buyer-chat" : "seller-chat"}`} style={{ display: "flex", flexDirection: "column", alignSelf: chat.speaker === "buyer" ? "flex-start" : "flex-end", maxWidth: "80%", background: chat.speaker === "buyer" ? "#f1f5f9" : "#ffefe9", border: "1px solid #edeef5", borderRadius: "12px", padding: "12px", gap: "4px", transform: "translateY(10px)", opacity: 1, animation: "sparkleGlow 0.3s forwards" }}>
                          <span style={{ fontSize: "11px", fontWeight: "bold", color: chat.speaker === "buyer" ? "#475569" : "#4F46E5" }}>
                            {chat.speaker === "buyer" ? "あなた (購入者代理AI)" : `出品者代理AI (${currentItem.sellerName} さん)`}
                          </span>
                          <p style={{ margin: 0, fontSize: "13px", color: "#1A1B2E" }}>{chat.text}</p>
                          <small style={{ fontSize: "10px", color: "#9698ab", alignSelf: "flex-end" }}>提示額: ¥{chat.price.toLocaleString()} ({chat.action.toUpperCase()})</small>
                        </div>
                      ))}
                      <div ref={dialogueEndRef} />
                    </div>

                    {dialogueIndex < res.dialogue.length - 1 && (
                      <p style={{ margin: 0, fontSize: "12px", color: "#9698ab", fontStyle: "italic", textAlign: "center" }}>
                        交渉は現在進行中...
                      </p>
                    )}

                    <button type="button" className="primary-button" onClick={() => { setShowNegotiation(false); setNegotiationResult(null); }} style={{ padding: "12px" }}>
                      交渉室を閉じる
                    </button>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {(showAppraisal || (autoPilot && autoPilotStep === 2)) && (
        <AppraisalModal 
          item={currentItem} 
          onClose={() => setShowAppraisal(false)} 
        />
      )}
    </section>
  );
}

// ==========================================
// AI 3D/AR Spatial Appraisal Scanner Component (Hologram Canvas)
// ==========================================

interface AppraisalModalProps {
  item: Item;
  onClose: () => void;
}

export function AppraisalModal({ item, onClose }: AppraisalModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [angleX, setAngleX] = useState(0.5);
  const [angleY, setAngleY] = useState(0.8);
  const [speed, setSpeed] = useState(0.015);
  const animationRef = useRef<number | null>(null);

  // Categories specific spatial data generator
  const getSpatialData = (category: string) => {
    switch (category) {
      case "家電・スマホ":
        return {
          dimensions: "147.5 mm × 71.5 mm × 7.85 mm",
          weight: "206 g",
          materials: "医療用サージカル・ステンレス ＆ セラミックシールドガラス",
          surfaceWear: "0.02% （光学3D深度スキャンにより、極微細なヘアライン擦れのみ検出）",
          structuralIntegrity: "100% 歪み・変形なし",
          estimatedMarket: `¥${Math.round(item.price * 0.94).toLocaleString()} 〜 ¥${Math.round(item.price * 1.02).toLocaleString()} （地域相場需要：高）`
        };
      case "衣服・ファッション":
        return {
          dimensions: "身丈: 1150 mm, 身幅: 510 mm, 袖丈: 610 mm",
          weight: "1,250 g",
          materials: "最高級エジプト超長綿 100% ギャバジン織り",
          surfaceWear: "0.05% （繊維3Dマイクロ解析。毛羽立ち・シミ・色褪せ等なしの極美品）",
          structuralIntegrity: "99.8% ほつれ・ヨレなし",
          estimatedMarket: `¥${Math.round(item.price * 0.95).toLocaleString()} 〜 ¥${Math.round(item.price * 1.05).toLocaleString()} （トレンド需要：安定）`
        };
      case "本・ゲーム・エンタメ":
        return {
          dimensions: "102 mm × 242 mm × 13.9 mm （コントローラー含む）",
          weight: "420 g",
          materials: "高耐衝撃性ポリカーボネート樹脂 ＆ 強化耐熱アクリル",
          surfaceWear: "0.08% （端子部、通気口、角部へのチリ・手垢・摩耗なし）",
          structuralIntegrity: "100% 液晶ドット抜け・ヒンジ歪みなし",
          estimatedMarket: `¥${Math.round(item.price * 0.93).toLocaleString()} 〜 ¥${Math.round(item.price * 1.03).toLocaleString()} （中古市場流動性：超活発）`
        };
      default:
        return {
          dimensions: "210 mm × 210 mm × 45 mm （自動測量値）",
          weight: "850 g",
          materials: "高耐久合成アクリル ＆ 削り出しアルミニウム合金",
          surfaceWear: "0.15% （経年変化、生活擦れのみ検出。Aクラス良品）",
          structuralIntegrity: "100% 健全",
          estimatedMarket: `¥${Math.round(item.price * 0.90).toLocaleString()} 〜 ¥${Math.round(item.price * 1.05).toLocaleString()}`
        };
    }
  };

  const data = getSpatialData(item.category);

  useEffect(() => {
    let currentAngleX = angleX;
    let currentAngleY = angleY;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Rotate slowly in background
      currentAngleX += speed * 0.4;
      currentAngleY += speed;

      // Define 3D Box vertices (representing a device or standard box)
      const dx = 55;
      const dy = 90;
      const dz = 15;
      const vertices = [
        [-dx, -dy, -dz], [dx, -dy, -dz], [dx, dy, -dz], [-dx, dy, -dz],
        [-dx, -dy,  dz], [dx, -dy,  dz], [dx, dy,  dz], [-dx, dy,  dz]
      ];

      // Projected 2D coordinates
      const projected: { x: number; y: number }[] = [];
      const fov = 260; // Camera distance perspective factor

      for (let i = 0; i < vertices.length; i++) {
        const [x, y, z] = vertices[i];

        // 3D Rotations (Y-axis then X-axis)
        const cosY = Math.cos(currentAngleY);
        const sinY = Math.sin(currentAngleY);
        const cosX = Math.cos(currentAngleX);
        const sinX = Math.sin(currentAngleX);

        // Y-rotation
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;

        // X-rotation
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        // Perspective Projection
        const scale = fov / (fov + z2);
        const cx = width / 2 + x1 * scale;
        const cy = height / 2 + y2 * scale;

        projected.push({ x: cx, y: cy });
      }

      // Draw Hologram Scanning Radar ring at bottom
      ctx.strokeStyle = "rgba(52, 211, 153, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2 + 100, 70, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(width / 2, height / 2 + 100, 30, 0, Math.PI * 2);
      ctx.stroke();

      // Draw Laser Sweep grid Lines inside hologram
      ctx.strokeStyle = "rgba(52, 211, 153, 0.08)";
      for (let yGrid = 30; yGrid < height; yGrid += 15) {
        ctx.beginPath();
        ctx.moveTo(10, yGrid);
        ctx.lineTo(width - 10, yGrid);
        ctx.stroke();
      }

      // Draw wireframe lines (neon green)
      ctx.strokeStyle = "rgba(52, 211, 153, 0.8)"; // Neon green
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#10b981";

      const drawLine = (p1: number, p2: number) => {
        ctx.beginPath();
        ctx.moveTo(projected[p1].x, projected[p1].y);
        ctx.lineTo(projected[p2].x, projected[p2].y);
        ctx.stroke();
      };

      // Draw Bottom face (vertices 0, 1, 2, 3)
      drawLine(0, 1); drawLine(1, 2); drawLine(2, 3); drawLine(3, 0);
      // Draw Top face (vertices 4, 5, 6, 7)
      drawLine(4, 5); drawLine(5, 6); drawLine(6, 7); drawLine(7, 4);
      // Draw Vertical pillars connecting them
      drawLine(0, 4); drawLine(1, 5); drawLine(2, 6); drawLine(3, 7);

      // Draw glowing scanning points on vertices
      ctx.fillStyle = "#34d399";
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#34d399";
      for (let i = 0; i < projected.length; i++) {
        ctx.beginPath();
        ctx.arc(projected[i].x, projected[i].y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Reset shadows
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [angleX, angleY, speed]);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.75)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1150, padding: "20px" }}>
      <div style={{ background: "#0f172a", border: "2px solid #34d399", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "800px", color: "#e2e8f0", boxShadow: "0 25px 50px -12px rgba(16, 185, 129, 0.3)", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {/* Style Tag for scanning overlay and animation keyframes */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes scanningSweep {
            0% { top: 0%; opacity: 0.1; }
            50% { top: 100%; opacity: 0.9; }
            100% { top: 0%; opacity: 0.1; }
          }
          .laser-beam-line {
            position: absolute;
            left: 0;
            width: 100%;
            height: 3px;
            background: #34d399;
            box-shadow: 0 0 8px #34d399, 0 0 16px #34d399;
            animation: scanningSweep 3s infinite linear;
          }
        ` }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155", paddingBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>🔮</span>
            <h3 style={{ margin: 0, color: "#34d399", fontSize: "18px", fontWeight: 800 }}>AI立体・AR空間査定スキャナー</h3>
          </div>
          <button type="button" className="ghost-button" onClick={onClose} style={{ color: "#94a3b8", border: "none", fontSize: "18px", padding: "4px 8px" }}>✕</button>
        </div>

        {/* Two-Column Diagnostic Board */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }} className="diagnostics-split">
          
          {/* Left Column: Laserscan overlay on Image */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#34d399", fontWeight: "bold", letterSpacing: "1px", alignSelf: "start" }}>[1/2] 3D PERSPECTIVE PHOTOGRAMMETRY SCAN</span>
            <div style={{ position: "relative", width: "100%", height: "260px", overflow: "hidden", borderRadius: "12px", border: "1px solid #334155", background: "#020617", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img 
                src={getPublicUrl(item.imageUrl) || "/placeholder.svg"} 
                alt="" 
                style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", opacity: 0.7 }}
              />
              <div className="laser-beam-line"></div>
              <div style={{ position: "absolute", bottom: "10px", left: "10px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid #34d399", borderRadius: "4px", padding: "4px 8px", fontSize: "9px", fontFamily: "monospace", color: "#34d399" }}>
                DEPTH_MAPPING: ACTIVE
              </div>
            </div>
          </div>

          {/* Right Column: Hologram Rotating Canvas */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#34d399", fontWeight: "bold", letterSpacing: "1px", alignSelf: "start" }}>[2/2] INTERACTIVE 3D HOLOGRAM PROJECTOR</span>
            <div style={{ position: "relative", width: "100%", height: "260px", borderRadius: "12px", border: "1px solid #334155", background: "#020617", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <canvas 
                ref={canvasRef} 
                width={300} 
                height={250} 
                style={{ width: "100%", height: "100%", display: "block" }}
              />
              <div style={{ position: "absolute", bottom: "10px", right: "10px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid #34d399", borderRadius: "4px", padding: "4px 8px", fontSize: "9px", fontFamily: "monospace", color: "#34d399" }}>
                FPS: 60.0 / B-TREE_RENDER
              </div>
            </div>
          </div>

        </div>

        {/* Spatial Report (Polite and beautiful Japanese) */}
        <div style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(52, 211, 153, 0.3)", borderRadius: "12px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", borderBottom: "1px solid rgba(52, 211, 153, 0.15)", paddingBottom: "6px" }}>
            <span style={{ fontSize: "14px" }}>📋</span>
            <strong style={{ fontSize: "13px", color: "#34d399" }}>AI空間解析・査定診断書 (3D SPATIAL REPORT)</strong>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", fontSize: "12px" }} className="diagnostics-info-grid">
            <div>
              <span style={{ color: "#94a3b8" }}>📐 測量寸法 (Dimensions):</span>
              <p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#f8fafc" }}>{data.dimensions}</p>
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>⚖️ 質量 (Weight):</span>
              <p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#f8fafc" }}>{data.weight}</p>
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>💎 材質診断 (Materials):</span>
              <p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#f8fafc" }}>{data.materials}</p>
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>🔍 摩耗・キズ検知 (Surface Wear):</span>
              <p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#f8fafc" }}>{data.surfaceWear}</p>
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>🏗️ 筐体歪み・変形率:</span>
              <p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#f8fafc" }}>{data.structuralIntegrity}</p>
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>📊 推定市場価値レンジ (Value Index):</span>
              <p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#34d399" }}>{data.estimatedMarket}</p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button 
            type="button" 
            className="primary-button" 
            onClick={onClose} 
            style={{ background: "#10b981", color: "#fff", border: "none", padding: "10px 24px", cursor: "pointer", borderRadius: "8px" }}
          >
            ✓ 診断レポートを確認して閉じる
          </button>
        </div>

      </div>
    </div>
  );
}
