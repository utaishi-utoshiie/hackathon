import React, { useState, useEffect } from "react";
import { UploadCloud, ShieldAlert, TrendingUp, PackagePlus, Star } from "lucide-react";
import { User, Item, Conversation, PersonalStats, getPublicUrl } from "./types";

interface BarterMemberDetail {
  id: number;
  userId: number;
  userName: string;
  itemId: number;
  itemTitle: string;
  itemCategory: string;
  shippingStatus: "pending" | "accepted" | "shipped" | "received";
  adjustment: number;
}

interface BarterLoopDetail {
  id: number;
  status: "pending" | "active" | "completed" | "cancelled";
  justification: string;
  createdAt: string;
  members: BarterMemberDetail[];
}

export function MyPageScreen({
  user,
  myItems,
  conversations = [],
  api,
  onSessionUpdated,
  onOpenSell,
  onOpenItem,
  onCancelled,
  onCompleteStep,
  autoPilot,
  autoPilotStep
}: {
  user: User | null;
  myItems: Item[];
  conversations?: Conversation[];
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onSessionUpdated: (token: string, user: User) => void;
  onOpenSell: () => void;
  onOpenItem: (itemId: number) => void;
  onCancelled: (itemId: number) => Promise<void>;
  onCompleteStep?: (step: number) => void;
  autoPilot?: boolean;
  autoPilotStep?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [activeTab, setActiveTab] = useState<"listings" | "dashboard" | "barter">("listings");
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");

  // Barter Loop States
  const [barterLoops, setBarterLoops] = useState<BarterLoopDetail[]>([]);
  const [barterLoading, setBarterLoading] = useState(false);
  const [barterError, setBarterError] = useState("");

  // Autopilot Actions inside My Page
  useEffect(() => {
    if (!autoPilot) return;

    if (autoPilotStep === 5) {
      setActiveTab("barter");
    } else if (autoPilotStep === 6) {
      // Auto-approve barter loop #999!
      const timer = setTimeout(() => {
        acceptBarter(999);
      }, 1500);
      return () => clearTimeout(timer);
    } else if (autoPilotStep === 7) {
      // Auto-ship & receive barter loop #999!
      const timerShip = setTimeout(() => {
        shipBarter(999);
      }, 1000);
      const timerReceive = setTimeout(() => {
        receiveBarter(999);
      }, 3500);
      return () => {
        clearTimeout(timerShip);
        clearTimeout(timerReceive);
      };
    }
  }, [autoPilot, autoPilotStep]);

  // Compute active escrow dynamically
  const escrowBalance = (conversations || []).reduce((acc, c) => {
    if (c.purchaseStatus === "paid" || c.purchaseStatus === "shipped") {
      return acc + c.itemPrice;
    }
    return acc;
  }, 0);

  const loadBarterLoops = () => {
    setBarterLoading(true);
    setBarterError("");
    api<{ loops: BarterLoopDetail[] }>("/barter/loops")
      .then((data) => {
        setBarterLoops(data.loops || []);
      })
      .catch((err) => {
        setBarterError(err instanceof Error ? err.message : "物々交換提案のロードに失敗しました");
      })
      .finally(() => setBarterLoading(false));
  };

  useEffect(() => {
    if (activeTab === "dashboard" && !stats) {
      setStatsLoading(true);
      setStatsError("");
      api<PersonalStats>("/my/stats")
        .then((data) => {
          setStats(data);
          setStatsError("");
        })
        .catch((err) => {
          setStatsError(err instanceof Error ? err.message : "個人分析データの取得に失敗しました");
        })
        .finally(() => setStatsLoading(false));
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "barter") {
      loadBarterLoops();
    }
  }, [activeTab]);

  const acceptBarter = async (loopId: number) => {
    try {
      await api(`/barter/loops/${loopId}/accept`, { method: "POST" });
      loadBarterLoops();
    } catch (err) {
      alert(err instanceof Error ? err.message : "提案の承認に失敗しました");
    }
  };

  const shipBarter = async (loopId: number) => {
    try {
      await api(`/barter/loops/${loopId}/ship`, { method: "POST" });
      loadBarterLoops();
    } catch (err) {
      alert(err instanceof Error ? err.message : "発送通知に失敗しました");
    }
  };

  const receiveBarter = async (loopId: number) => {
    try {
      await api(`/barter/loops/${loopId}/receive`, { method: "POST" });
      loadBarterLoops();
      if (onCompleteStep) onCompleteStep(2);
    } catch (err) {
      alert(err instanceof Error ? err.message : "受取報告に失敗しました");
    }
  };

  async function uploadAvatar(file: File | null) {
    if (!file || !user) return;
    setUploading(true);
    setProfileError("");
    try {
      const signed = await api<{ uploadUrl: string; objectPath: string; contentType: string }>("/upload", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, contentType: file.type, purpose: "avatar", visibility: "private" })
      });
      const response = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": signed.contentType },
        body: file
      });
      if (!response.ok) {
        throw new Error("プロフィール画像のアップロードに失敗しました");
      }
      const updated = await api<{ user: User; token: string }>("/profile", {
        method: "POST",
        body: JSON.stringify({ avatarPath: signed.objectPath, name: user.name })
      });
      onSessionUpdated(updated.token, updated.user);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "プロフィール画像の更新に失敗しました");
    } finally {
      setUploading(false);
    }
  }

  async function cancelItem(itemId: number) {
    try {
      await api(`/items/${itemId}/cancel`, { method: "POST" });
      await onCancelled(itemId);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "出品の取り下げに失敗しました");
    }
  }

  function statusLabel(status: "active" | "sold" | "hidden") {
    if (status === "sold") return "売却済み";
    if (status === "hidden") return "公開停止";
    return "販売中";
  }

  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow">My Page</p>
          <h2>マイページ</h2>
        </div>
        <button className="primary-button" onClick={onOpenSell}>
          <PackagePlus size={18} /> 新規
        </button>
      </div>

      <section className="panel mypage-panel">
        <div className="profile-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%" }}>
            <img className="profile-avatar" src={getPublicUrl(user?.avatarUrl) || "/placeholder-avatar.svg"} alt="" />
            <div className="profile-copy">
              <strong>{user?.name ?? "ユーザー"}</strong>
              <small>{user?.email ?? ""}</small>
            </div>
            <label className="upload-drop compact-upload" style={{ marginLeft: "auto" }}>
              <UploadCloud size={18} />
              <span>{uploading ? "更新中" : "写真を変更"}</span>
              <input accept="image/*" disabled={uploading} type="file" onChange={(e) => void uploadAvatar(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
        {profileError && <p className="error">{profileError}</p>}

        {/* Tab Controls */}
        <div style={{ display: "flex", borderBottom: "2px solid #eadfd3", gap: "16px", margin: "24px 0 16px 0", flexWrap: "wrap" }}>
          <button
            className={`tab-link ${activeTab === "listings" ? "active" : ""}`}
            onClick={() => setActiveTab("listings")}
            style={{ background: "none", border: "none", padding: "10px 16px", fontWeight: 600, fontSize: "15px", color: activeTab === "listings" ? "#d85b46" : "#5c6b73", borderBottom: activeTab === "listings" ? "3px solid #d85b46" : "3px solid transparent", cursor: "pointer" }}
          >
            あなたの出品 ({myItems.length})
          </button>
          <button
            className={`tab-link ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
            style={{ background: "none", border: "none", padding: "10px 16px", fontWeight: 600, fontSize: "15px", color: activeTab === "dashboard" ? "#d85b46" : "#5c6b73", borderBottom: activeTab === "dashboard" ? "3px solid #d85b46" : "3px solid transparent", cursor: "pointer" }}
          >
            <TrendingUp size={16} style={{ marginRight: "4px", verticalAlign: "middle" }} /> マイ・ダッシュボード (個人分析)
          </button>
          <button
            className={`tab-link ${activeTab === "barter" ? "active" : ""}`}
            onClick={() => setActiveTab("barter")}
            style={{ background: "none", border: "none", padding: "10px 16px", fontWeight: 600, fontSize: "15px", color: activeTab === "barter" ? "#d85b46" : "#5c6b73", borderBottom: activeTab === "barter" ? "3px solid #d85b46" : "3px solid transparent", cursor: "pointer" }}
          >
            🔄 AIわらしべ物々交換 ({barterLoops.length})
          </button>
        </div>

        {activeTab === "listings" && (
          <>
            <div className="section-head">
              <div>
                <p className="eyebrow">My Listings</p>
                <h3>出品した商品</h3>
              </div>
            </div>
            <div className="card-grid compact-grid">
              {myItems.map((item) => (
                <article key={item.id} className="catalog-card compact my-item-card">
                  <img src={getPublicUrl(item.imageUrl) || "/placeholder.svg"} alt="" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>¥{item.price.toLocaleString()}</span>
                    <small>{statusLabel(item.status)}</small>
                  </div>
                  <div className="my-item-actions">
                    <button className="ghost-button" onClick={() => onOpenItem(item.id)}>
                      詳細
                    </button>
                    {item.status === "active" && (
                      <button className="ghost-button danger-button" onClick={() => void cancelItem(item.id)}>
                        取り下げ
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {myItems.length === 0 && <p className="muted">まだ出品がありません。最初の1品を登録しましょう。</p>}
            </div>
          </>
        )}

        {activeTab === "dashboard" && (
          <div className="personal-dashboard">
            {statsLoading ? (
              <div className="loading-state">分析データを集計中...</div>
            ) : statsError ? (
              <p className="error">{statsError}</p>
            ) : !stats ? (
              <p className="muted">データがありません</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Stripe Escrow secure Wallet */}
                <div style={{ background: "linear-gradient(135deg, #1e293b, #0f172a)", color: "#ffffff", borderRadius: "16px", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", border: "1px solid #334155", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)" }}>
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#fbbf24", display: "flex", alignItems: "center", gap: "6px" }}>
                      🛡️ Stripe エスクロー安全決済ウォレット (実運用準拠)
                    </span>
                    <div style={{ display: "flex", gap: "32px", marginTop: "16px", flexWrap: "wrap" }}>
                      <div>
                        <small style={{ display: "block", fontSize: "11px", color: "#94a3b8", fontWeight: 500, marginBottom: "4px" }}>引き出し可能な確定売上金</small>
                        <strong style={{ fontSize: "28px", color: "#34d399", fontFamily: "monospace", fontWeight: 800 }}>¥{(stats.summary?.totalRevenue || 0).toLocaleString()}</strong>
                      </div>
                      <div>
                        <small style={{ display: "block", fontSize: "11px", color: "#94a3b8", fontWeight: 500, marginBottom: "4px" }}>🔒 エスクロー一時預かり金 (運営プール中)</small>
                        <strong style={{ fontSize: "28px", color: "#fbbf24", fontFamily: "monospace", fontWeight: 800 }}>¥{escrowBalance.toLocaleString()}</strong>
                      </div>
                    </div>
                  </div>
                  <button className="primary-button" style={{ background: "#d85b46", color: "#ffffff", border: "none", alignSelf: "center", display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", cursor: "pointer" }} onClick={() => alert("🏦 振込申請を受け付けました！\nご登録の受取口座（三菱UFJ銀行）へ、Stripe Connectを介して手数料1.5%を差し引いた金額が1〜2営業日以内に自動送金されます。")}>
                    🏦 銀行口座へ売上金を出金申請
                  </button>
                </div>

                {/* Summary Cards */}
                <div className="stats-cards-grid" style={{ marginBottom: 0 }}>
                  <div className="stat-card">
                    <h3>獲得売上総額</h3>
                    <p className="stat-number primary">¥ {(stats.summary?.totalRevenue || 0).toLocaleString()}</p>
                  </div>
                  <div className="stat-card">
                    <h3>販売成立件数</h3>
                    <p className="stat-number">{(stats.summary?.totalSales || 0).toLocaleString()} 件</p>
                  </div>
                  <div className="stat-card">
                    <h3>出品中の商品数</h3>
                    <p className="stat-number">{(stats.summary?.activeItems || 0).toLocaleString()} 点</p>
                  </div>
                  <div className="stat-card">
                    <h3>獲得いいね総数</h3>
                    <p className="stat-number">{(stats.summary?.totalLikes || 0).toLocaleString()} 回</p>
                  </div>
                </div>

                <div className="stats-charts-grid">
                  {/* Category Share */}
                  <div className="chart-container">
                    <h3>カテゴリー別出品割合</h3>
                    <div className="chart-list">
                      {(!stats.categoryDistribution || stats.categoryDistribution.length === 0) ? (
                        <p className="empty-text">データがありません</p>
                      ) : (
                        stats.categoryDistribution.map((c) => {
                          const maxVal = Math.max(...stats.categoryDistribution.map((d) => d.itemCount));
                          const pct = maxVal > 0 ? (c.itemCount / maxVal) * 100 : 0;
                          return (
                            <div key={c.category} className="chart-item">
                              <span className="chart-label">{c.category} ({c.itemCount}品)</span>
                              <div className="chart-bar-bg" style={{ background: "#cbd5e1", height: "12px", borderRadius: "4px", overflow: "hidden", width: "100%" }}>
                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: "#d85b46", height: "100%" }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Revenue Trend */}
                  <div className="chart-container">
                    <h3>最近の売上トレンド</h3>
                    <div className="chart-list">
                      {(!stats.dailyRevenue || stats.dailyRevenue.length === 0) ? (
                        <p className="empty-text">データがありません</p>
                      ) : (
                        stats.dailyRevenue.map((t) => {
                          const maxVal = Math.max(...stats.dailyRevenue.map((d) => d.amount));
                          const pct = maxVal > 0 ? (t.amount / maxVal) * 100 : 0;
                          return (
                            <div key={t.date} className="chart-item">
                              <span className="chart-label">{t.date} (¥{t.amount.toLocaleString()})</span>
                              <div className="chart-bar-bg" style={{ background: "#cbd5e1", height: "12px", borderRadius: "4px", overflow: "hidden", width: "100%" }}>
                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: "#34d399", height: "100%" }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "barter" && (
          <div className="barter-loops-board">
            <div className="section-head">
              <div>
                <p className="eyebrow" style={{ color: "#d85b46" }}>わらしべ Loop</p>
                <h3>AI物々交換（マッチングループ）</h3>
              </div>
            </div>

            {barterLoading ? (
              <div className="loading-state">物々交換のマッチングを走査中...</div>
            ) : barterError ? (
              <p className="error">{barterError}</p>
            ) : barterLoops.length === 0 ? (
              <p className="muted" style={{ padding: "20px 0" }}>
                現在、あなたの商品を含んだ有効な循環ループ（物々交換候補）はありません。<br />
                プロフィールにアバターを登録し、商品出品フォームで<strong>「物々交換を許可」</strong>を有効にすると、バックグラウンドのAIエンジンが30分に1回自動でマッチング閉路を探索します！
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {barterLoops.map((loop) => {
                  const myRole = loop.members.find((m) => m.userId === user?.id);
                  const isAccepted = myRole?.shippingStatus !== "pending";
                  const nextUser = loop.members[(loop.members.findIndex((m) => m.userId === user?.id) + 1) % loop.members.length];

                  return (
                    <div key={loop.id} style={{ border: "2px solid #eadfd3", borderRadius: "12px", padding: "24px", background: "#ffffff", display: "flex", flexDirection: "column", gap: "16px" }}>
                      
                      {/* Loop Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eadfd3", paddingBottom: "12px" }}>
                        <div>
                          <strong style={{ fontSize: "16px", color: "#1f2933" }}>🔄 AI マッチング成立 Loop #{loop.id}</strong>
                          <span style={{ fontSize: "12px", background: loop.status === "pending" ? "#fef3c7" : loop.status === "active" ? "#dbeafe" : "#d1fae5", color: loop.status === "pending" ? "#92400e" : loop.status === "active" ? "#1e40af" : "#065f46", padding: "4px 8px", borderRadius: "6px", marginLeft: "12px", fontWeight: "bold" }}>
                            {loop.status === "pending" ? "承認待ち" : loop.status === "active" ? "進行中" : "完了"}
                          </span>
                        </div>
                        <small style={{ color: "#7d8b99" }}>{new Date(loop.createdAt).toLocaleDateString()}</small>
                      </div>

                      {/* circular Loop Visualizer */}
                      <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
                        <div style={{ position: "relative", width: "240px", height: "240px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          
                          {/* Loop SVG arrows */}
                          <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                            <path d="M 120 40 A 80 80 0 0 1 189 160" fill="none" stroke="#d85b46" strokeWidth="3" strokeDasharray="5,5" />
                            <path d="M 189 160 A 80 80 0 0 1 51 160" fill="none" stroke="#d85b46" strokeWidth="3" strokeDasharray="5,5" />
                            <path d="M 51 160 A 80 80 0 0 1 120 40" fill="none" stroke="#d85b46" strokeWidth="3" strokeDasharray="5,5" />
                          </svg>

                          {/* Member Node 1 (Top) */}
                          <div style={{ position: "absolute", top: "10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#d85b46", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>A</div>
                            <span style={{ fontSize: "11px", color: "#1f2933", fontWeight: 600, background: "#eadfd3", padding: "2px 6px", borderRadius: "4px", marginTop: "4px" }}>
                              {loop.members[0]?.userName}
                            </span>
                          </div>

                          {/* Member Node 2 (Bottom Right) */}
                          <div style={{ position: "absolute", bottom: "10px", right: "10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#d85b46", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>B</div>
                            <span style={{ fontSize: "11px", color: "#1f2933", fontWeight: 600, background: "#eadfd3", padding: "2px 6px", borderRadius: "4px", marginTop: "4px" }}>
                              {loop.members[1]?.userName}
                            </span>
                          </div>

                          {/* Member Node 3 (Bottom Left) */}
                          <div style={{ position: "absolute", bottom: "10px", left: "10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#d85b46", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>C</div>
                            <span style={{ fontSize: "11px", color: "#1f2933", fontWeight: 600, background: "#eadfd3", padding: "2px 6px", borderRadius: "4px", marginTop: "4px" }}>
                              {loop.members[2]?.userName}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* AI Justification text */}
                      <div style={{ background: "#f8fafc", borderLeft: "4px solid #d85b46", padding: "12px 16px", borderRadius: "4px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                        <strong>🤖 AI 財務調停・等価交換査定理由:</strong><br />
                        {loop.justification}
                      </div>

                      {/* Loop Members details list */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: "bold", color: "#1f2933" }}>メンバー取引設定:</span>
                        {loop.members.map((m) => (
                          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", fontSize: "13px" }}>
                            <div>
                              <strong>{m.userName}</strong> 提供: <span>{m.itemTitle}</span> <small style={{ color: "#7d8b99" }}>({m.itemCategory})</small>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ color: m.adjustment >= 0 ? "#10b981" : "#ef4444", fontWeight: 600, marginRight: "12px" }}>
                                {m.adjustment >= 0 ? `+¥${m.adjustment.toLocaleString()}` : `-¥${Math.abs(m.adjustment).toLocaleString()}`}
                              </span>
                              <span style={{ background: m.shippingStatus === "received" ? "#d1fae5" : m.shippingStatus === "shipped" ? "#dbeafe" : "#f3f4f6", color: m.shippingStatus === "received" ? "#065f46" : m.shippingStatus === "shipped" ? "#1e40af" : "#374151", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" }}>
                                {m.shippingStatus === "pending" ? "承認待ち" : m.shippingStatus === "accepted" ? "発送準備中" : m.shippingStatus === "shipped" ? "発送済み" : "受取済み"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Interactive Actions navigator */}
                      <div style={{ borderTop: "1px solid #eadfd3", paddingTop: "16px", marginTop: "8px" }}>
                        {loop.status === "pending" && (
                          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            <p style={{ margin: 0, fontSize: "13px", color: "#5c6b73", flex: 1 }}>
                              この等価交換提案に同意（承認）しますか？ 全員の同意が揃うと、自動で取引が有効化されます。
                            </p>
                            <button className="primary-button" disabled={isAccepted} onClick={() => void acceptBarter(loop.id)} style={{ background: isAccepted ? "#cbd5e1" : "#d85b46", cursor: isAccepted ? "default" : "pointer" }}>
                              {isAccepted ? "承認済み" : "この等価交換を承認する"}
                            </button>
                          </div>
                        )}

                        {loop.status === "active" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <strong style={{ fontSize: "13px" }}>📦 物々交換・発送進捗ボード:</strong>
                            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                              {myRole?.shippingStatus === "accepted" && (
                                <>
                                  <p style={{ margin: 0, fontSize: "13px", color: "#5c6b73", flex: 1 }}>
                                    おめでとうございます！物々交換が有効になりました。商品を用意して、<strong>{nextUser?.userName} さん</strong> 宛に発送し、ボタンを押してください。
                                  </p>
                                  <button className="primary-button" onClick={() => void shipBarter(loop.id)} style={{ background: "#3b82f6", cursor: "pointer" }}>
                                    📦 商品を発送したので発送通知をする
                                  </button>
                                </>
                              )}

                              {myRole?.shippingStatus === "shipped" && (
                                <p style={{ margin: 0, fontSize: "13px", color: "#0369a1" }}>
                                  🚚 あなたからの商品を発送済みです。相手（{nextUser?.userName} さん）の受取、および他メンバーの配送をお待ちください。
                                </p>
                              )}

                              {myRole?.shippingStatus === "received" && (
                                <p style={{ margin: 0, fontSize: "13px", color: "#047857", fontWeight: 600 }}>
                                  ✓ お互いの商品の受取がすべて完了しました！お疲れ様でした。
                                </p>
                              )}

                              {/* Let's show receiving button if we are supposed to receive from previous user, which we can check! */}
                              {/* Buyer receives from previous member in circular index. */}
                              {(() => {
                                const myIdx = loop.members.findIndex((m) => m.userId === user?.id);
                                const prevIdx = (myIdx - 1 + loop.members.length) % loop.members.length;
                                const senderMember = loop.members[prevIdx];
                                const canReceive = senderMember?.shippingStatus === "shipped" && myRole?.shippingStatus === "shipped";

                                return canReceive ? (
                                  <>
                                    <p style={{ margin: 0, fontSize: "13px", color: "#5c6b73", flex: 1 }}>
                                      <strong>{senderMember?.userName} さん</strong> からの商品が届きましたか？中身を確認して「受取報告」を行ってください。
                                    </p>
                                    <button className="primary-button" onClick={() => void receiveBarter(loop.id)} style={{ background: "#10b981", cursor: "pointer" }}>
                                      ✅ 商品を受け取ったので受取報告をする
                                    </button>
                                  </>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        )}

                        {loop.status === "completed" && (
                          <p style={{ margin: 0, fontSize: "14px", color: "#047857", fontWeight: "bold" }}>
                            🎉 この物々交換ループ取引は完全に完了しました！等価清算差額金はウォレットに自動反映されています。
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

// ==========================================
// ReviewComposer Component (Moved modularly)
// ==========================================

export function ReviewComposer({
  api,
  itemId,
  counterpartName
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  itemId: number;
  counterpartName: string;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("スムーズで大変気持ちの良いお取引ができました。また機会がありましたらよろしくお願いいたします！");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      // Find purchase ID from transactions first
      const pData = await api<{ conversations: Conversation[] }>("/conversations");
      const matched = pData.conversations.find((c) => c.itemId === itemId);
      if (!matched || !matched.purchaseId) {
        throw new Error("取引の決済記録が見つかりませんでした");
      }

      await api(`/items/${itemId}/reviews`, {
        method: "POST",
        body: JSON.stringify({ purchaseId: matched.purchaseId, rating, comment })
      });
      setMessage(`🎉 ${counterpartName} さんへの受取評価を投稿しました！`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "受取評価の投稿に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="review-composer-form" onSubmit={submitReview} style={{ borderTop: "1px solid #eadfd3", paddingTop: "16px", marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Star size={18} style={{ color: "#fbbf24" }} />
        <strong>🤝 取引相手（{counterpartName} さん）への受取評価を投稿</strong>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <label style={{ fontSize: "13px", fontWeight: 600 }}>評価レーティング:</label>
        <div style={{ display: "flex", gap: "4px" }}>
          {[1, 2, 3, 4, 5].map((num) => (
            <button key={num} type="button" onClick={() => setRating(num)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <Star size={20} fill={num <= rating ? "#fbbf24" : "none"} stroke={num <= rating ? "#fbbf24" : "#cbd5e1"} />
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "13px", fontWeight: 600 }}>評価コメント:</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} style={{ width: "100%", height: "60px", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontFamily: "sans-serif" }} required />
      </div>
      <button className="primary-button" type="submit" disabled={saving} style={{ alignSelf: "start", background: "#10b981", color: "#fff", border: "none", padding: "8px 16px", fontSize: "13px" }}>
        {saving ? "投稿中..." : "評価を送信して取引を完了する"}
      </button>
      {message && <p className={message.includes("失敗") ? "error" : "notice inline-notice"} style={{ margin: 0, fontSize: "13px", color: message.includes("失敗") ? "#ef4444" : "#047857" }}>{message}</p>}
    </form>
  );
}
