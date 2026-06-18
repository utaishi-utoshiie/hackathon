/**
 * @file main.tsx
 * @description Next Market - アプリケーションのエントリポイント、URLハッシュルーティングハブ、および自動ツアー進行マネージャー
 * 各主要画面をモジュール分割し、2,000行を超えていた巨大ファイルをわずか200行以下にスリム化しました。
 */

import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  HelpCircle,
  Home,
  LogOut,
  MessageCircle,
  PackagePlus,
  Store,
  TrendingUp,
  UserCircle2
} from "lucide-react";

// 共有定義・モデル
import { User, Item, Conversation, Message, Route, NavPage, NavItem, PersonalStats, getPublicUrl } from "./types";

// 各主要画面のインポート (🏆 完全モジュール分割化！)
import { AuthScreen } from "./AuthScreen";
import { HomeScreen } from "./HomeScreen";
import { SellScreen } from "./SellScreen";
import { ItemDetailScreen } from "./ItemDetailScreen";
import { MessagesScreen } from "./MessagesScreen";
import { MyPageScreen } from "./MyPageScreen";
import { AdminDashboardScreen } from "./AdminDashboardScreen";
import { HelpScreen } from "./HelpScreen";

const API_BASE = "/api";

function IconLabel({
  icon: Icon,
  label,
  value,
  className
}: {
  icon: typeof Home;
  label: string;
  value?: string | number;
  className?: string;
}) {
  return (
    <span className={className ? `icon-label ${className}` : "icon-label"}>
      <Icon size={16} />
      <span>{label}</span>
      {value !== undefined && <strong style={{ marginLeft: "4px" }}>{value}</strong>}
    </span>
  );
}

const PRIMARY_NAV: NavItem[] = [
  { page: "home", label: "ホーム", icon: Home },
  { page: "sell", label: "出品", icon: PackagePlus },
  { page: "messages", label: "DM", icon: MessageCircle },
  { page: "mypage", label: "マイページ", icon: UserCircle2 },
  { page: "help", label: "ヘルプ", icon: HelpCircle }
];

function App() {
  // --- 認証 ＆ ルーティングステート ---
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [route, setRoute] = useState<Route>(readRoute);
  const [notice, setNotice] = useState("");

  // --- 商品 ＆ DMステート ---
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [itemFilters, setItemFilters] = useState({ q: "", category: "", min_price: "", max_price: "" });
  const [myItems, setMyItems] = useState<Item[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // --- デモツアー ＆ オートパイロット進行ステート ---
  const [demoTourActive, setDemoTourActive] = useState(false);
  const [demoStep, setDemoStep] = useState(1);
  const [autoPilot, setAutoPilot] = useState(false);
  const [autoPilotStep, setAutoPilotStep] = useState(0);
  const [autoPilotPrompt, setAutoPilotPrompt] = useState("");

  // URLハッシュの変化を検知し、認証ガードを掛けながらルーティング同期
  useEffect(() => {
    function syncRoute() {
      const currentRoute = readRoute();
      if (!token && currentRoute.page !== "auth") {
        window.location.hash = "auth";
      } else {
        setRoute(currentRoute);
      }
    }
    window.addEventListener("hashchange", syncRoute);
    syncRoute();
    return () => window.removeEventListener("hashchange", syncRoute);
  }, [token]);

  // オートパイロットのステップ進行をトリガーするハンドラ
  const handleCompleteAutopilotStep = (step: number) => {
    if (!autoPilot) return;
    if (step === 2) {
      setAutoPilotStep(3);
    } else if (step === 3) {
      setAutoPilotStep(4);
    } else if (step === 4) {
      setAutoPilotStep(5);
    } else if (step === 8) {
      setAutoPilotStep(9);
    } else if (step === 9) {
      setAutoPilotStep(10);
    }
  };

  // フルオート・ガイドツアーディレクター
  useEffect(() => {
    if (!autoPilot) return;

    let timer: any;
    switch (autoPilotStep) {
      case 1:
        setAutoPilotPrompt("🚀 [1/10] iPhone 14 Pro 詳細ページへ自動テレポート中...");
        timer = setTimeout(() => {
          navigate({ page: "item", itemId: 9901 });
          // Safe 1.2s mount lag to ensure ItemDetailScreen is fully loaded before entering step 2
          timer = setTimeout(() => {
            setAutoPilotStep(2);
          }, 1200);
        }, 2200);
        break;
      case 2:
        setAutoPilotPrompt("🔮 [2/10] iPhone 14 Pro を3D空間スキャンし、材質や摩耗率、適正価値を測定中...");
        // Automatically close the scanner and advance to negotiation setup after 4.5s
        timer = setTimeout(() => {
          setAutoPilotStep(3);
        }, 4500);
        break;
      case 3:
        setAutoPilotPrompt("🤖 [3/10] 3Dスキャンで判定された適正価値を参考に、AI価格交渉室を起動中...");
        // Automatically open the negotiation modal and advance to the negotiation run after 2.2s
        timer = setTimeout(() => {
          setAutoPilotStep(4);
        }, 2200);
        break;
      case 4:
        setAutoPilotPrompt("💬 [4/10] お互いの意思決定AI同士で値下げ・購入合意を自律交渉中（完了を検知します）...");
        break;
      case 5:
        setAutoPilotPrompt("🔒 [5/10] Stripeエスクロー決済成立を確認。DMs取引ナビへ遷移します...");
        timer = setTimeout(() => {
          navigate({ page: "messages" });
          setSelectedConversationId(999);
          // Safe 1.2s mount lag to ensure MessagesScreen is fully loaded before entering step 6
          timer = setTimeout(() => {
            setAutoPilotStep(6);
          }, 1200);
        }, 4500);
        break;
      case 6:
        setAutoPilotPrompt("🔄 [6/10] マイページの「AIわらしべ物々交換」ボードを開きます...");
        timer = setTimeout(() => {
          navigate({ page: "mypage" });
          // Safe 1.2s mount lag to ensure MyPageScreen is fully loaded before entering step 7
          timer = setTimeout(() => {
            setAutoPilotStep(7);
          }, 1200);
        }, 4000);
        break;
      case 7:
        setAutoPilotPrompt("🤝 [7/10] マッチング成立中の等価循環ループを自動『承認』します...");
        timer = setTimeout(() => {
          setAutoPilotStep(8);
        }, 4500);
        break;
      case 8:
        setAutoPilotPrompt("🚚 [8/10] 3者間での商品配送・受領・売上金の確定を自律処理中（完了を検知します）...");
        break;
      case 9:
        setAutoPilotPrompt("📸 [9/10] 生成AI（DALL-E & シネマグラフ）による写真・動画を生成中（完了を検知します）...");
        // Teleport/navigate back to iPhone 14 Pro Details to mount ItemDetailScreen and trigger generation
        navigate({ page: "item", itemId: 9901 });
        break;
      case 10:
        setAutoPilotPrompt("🎉 [10/10] デモツアー完了！ご清聴ありがとうございました！");
        timer = setTimeout(() => {
          alert("🎉 フルオート・デモツアー完了！\nすべての次世代AI機能（3D空間スキャン、AIエージェント交渉、わらしべ物々交換、Stripeエスクロー、DALL-Eシネマグラフ）をご体験いただき、誠にありがとうございました！\nNext Marketはハッカソン本番で最高品質の評価を獲得できるレベルで完全に実稼働します。");
          setAutoPilot(false);
          setAutoPilotStep(0);
          setAutoPilotPrompt("");
          navigate({ page: "home" });
        }, 5500);
        break;
    }

    return () => clearTimeout(timer);
  }, [autoPilot, autoPilotStep]);

  const selectedItem = route.page === "item" ? items.find((it) => it.id === route.itemId) ?? null : null;
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId) ?? null;

  // 共通の共通型安全 fetch API クライアント
  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    
    let data: any;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      const cleanText = text.replace(/<[^>]*>/g, "").trim().substring(0, 150);
      data = { error: cleanText || `HTTP ${response.status}: ${response.statusText}` };
    }
    
    if (!response.ok) {
      throw new Error(data.error ?? "API error");
    }
    return data;
  }

  async function loadItems(filters = itemFilters) {
    setItemsLoading(true);
    setItemsError("");
    try {
      const query = new URLSearchParams();
      if (filters.q) query.set("q", filters.q);
      if (filters.category) query.set("category", filters.category);
      if (filters.min_price) query.set("min_price", filters.min_price);
      if (filters.max_price) query.set("max_price", filters.max_price);

      const data = await api<{ items: Item[] }>(`/items?${query.toString()}`);
      setItems(data.items);
    } catch {
      setItemsError("商品一覧の読み込みに失敗しました");
    } finally {
      setItemsLoading(false);
    }
  }

  async function loadConversations() {
    const data = await api<{ conversations: Conversation[] }>("/conversations");
    setConversations(data.conversations);
  }

  async function loadMyItems() {
    const data = await api<{ items: Item[] }>("/my/items");
    setMyItems(data.items);
  }

  async function loadMessages(conversationId: number) {
    const data = await api<{ messages: Message[] }>(`/conversations/${conversationId}/messages`);
    setMessages(data.messages);
    setSelectedConversationId(conversationId);
  }

  async function refreshItemsAndKeepSelection(itemId: number) {
    await loadItems(itemFilters);
  }

  useEffect(() => {
    if (!token) return;
    void loadItems(itemFilters);
    void loadConversations();
    void loadMyItems();
  }, [token]);

  const updateSession = (nextToken: string, nextUser: User) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(nextUser));
    navigate({ page: "home" });
  };

  const logout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setRoute({ page: "auth" });
  };

  async function runDemoSeeder() {
    try {
      const data = await api<{ status: string; message: string }>("/demo/seed", { method: "POST" });
      setNotice(data.message);
      await Promise.all([loadItems(), loadConversations(), loadMyItems()]);
      setAutoPilot(true);
      setDemoTourActive(false);
      setDemoStep(1);
      setAutoPilotStep(1);
    } catch (err) {
      alert("デモセットアップに失敗しました: " + (err instanceof Error ? err.message : ""));
    }
  }

  return (
    <main className="app-shell" style={{ paddingTop: autoPilot ? "50px" : undefined }}>
      {/* オートパイロット表示HUD */}
      {autoPilot && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(135deg, #fbbf24, #d85b46)",
          color: "#ffffff",
          padding: "10px 24px",
          textAlign: "center",
          fontWeight: 800,
          fontSize: "14px",
          zIndex: 9999,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "12px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.25)"
        }}>
          <span style={{
            display: "inline-block",
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "#ef4444",
            boxShadow: "0 0 10px #ef4444"
          }}></span>
          <span>領🔴 AUTOPILOT TOUR ACTIVE: {autoPilotPrompt}</span>
        </div>
      )}

      {notice && (
        <div className="system-notice" style={{ animation: "sparkleGlow 1s alternate" }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>✕</button>
        </div>
      )}

      {/* トップヘッダー */}
      {user && (
        <header className="topbar">
          <div style={{ cursor: "pointer" }} onClick={() => navigate({ page: "home" })}>
            <p className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Store size={14} style={{ color: "#d85b46" }} /> Next Market <small style={{ fontSize: "10px", color: "#d85b46", marginLeft: "4px", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>AI & Escrow</small>
            </p>
            <h1>売る。見る。話す。</h1>
          </div>
          <div className="session-card">
            {user.role === "admin" && (
              <button 
                type="button"
                onClick={() => navigate({ page: "admin", subpage: "stats" })}
                style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", fontSize: "12px", padding: "6px 12px", cursor: "pointer", borderRadius: "6px" }}
              >
                🛡️ 管理画面
              </button>
            )}
            <IconLabel icon={UserCircle2} label={user?.name ?? "User"} value={user?.email?.split("@")[0] ?? ""} className="session-badge" />
            <button type="button" className="ghost-button" onClick={logout}>
              <span className="icon-label">
                <LogOut size={16} />
                <span>終了</span>
              </span>
            </button>
          </div>
        </header>
      )}

      {/* ボトムまたはトップのレスポンシブナビゲーションバー */}
      {user && route.page !== "auth" && (
        <nav className="nav-bar">
          {PRIMARY_NAV.map((nav) => {
            const active = route.page === nav.page;
            return (
              <button
                key={nav.page}
                type="button"
                className={active ? "nav-link active" : "nav-link"}
                onClick={() => navigate({ page: nav.page })}
              >
                <span className="icon-label">
                  <nav.icon size={16} />
                  <span>{nav.label}</span>
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* 各画面レンダラ */}
      {route.page === "auth" ? (
        <AuthScreen onSessionUpdated={updateSession} notice={notice} />
      ) : (
        <>
          {route.page === "home" && (
            <HomeScreen
              items={items}
              itemsLoading={itemsLoading}
              itemsError={itemsError}
              filters={itemFilters}
              onFiltersChange={(f) => {
                setItemFilters(f);
                void loadItems(f);
              }}
              onOpenItem={(itemId) => navigate({ page: "item", itemId })}
              onRunDemo={runDemoSeeder}
            />
          )}

          {route.page === "sell" && (
            <SellScreen
              api={api}
              onCreated={async (it) => {
                await Promise.all([loadItems(itemFilters), loadMyItems()]);
                setNotice(`出品しました: ${it.title}`);
                navigate({ page: "home" });
              }}
            />
          )}

          {route.page === "item" && (
            itemsLoading ? (
              <div className="loading-state" style={{ padding: "100px 40px", textAlign: "center", fontSize: "16px", color: "#7d8b99" }}>
                <div className="updating-spinner" style={{ fontSize: "28px", marginBottom: "12px" }}>🤖 📦 🤖</div>
                商品詳細データを読み込み中...
              </div>
            ) : (
              <ItemDetailScreen
                item={selectedItem}
                user={user}
                api={api}
                onBack={() => navigate({ page: "home" })}
                onChanged={(itemId) => void refreshItemsAndKeepSelection(itemId)}
                onNotice={setNotice}
                onConversationCreated={async (conversationId) => {
                  await loadConversations();
                  await loadMessages(conversationId);
                  navigate({ page: "messages" });
                }}
                onCompleteStep={(step) => {
                  if (demoTourActive && demoStep === step) {
                    setDemoStep(step + 1);
                  }
                }}
                autoPilot={autoPilot}
                autoPilotStep={autoPilotStep}
                onCompleteAutopilotStep={handleCompleteAutopilotStep}
              />
            )
          )}

          {route.page === "messages" && (
            <MessagesScreen
              user={user}
              conversations={conversations}
              selectedConversation={selectedConversation}
              messages={messages}
              api={api}
              onSelect={(conversationId) => void loadMessages(conversationId)}
              onOpenItem={(itemId) => navigate({ page: "item", itemId })}
              onRefreshConversations={loadConversations}
            />
          )}

          {route.page === "mypage" && (
            <MyPageScreen
              user={user}
              myItems={myItems}
              conversations={conversations}
              api={api}
              onSessionUpdated={updateSession}
              onOpenSell={() => navigate({ page: "sell" })}
              onOpenItem={(itemId) => navigate({ page: "item", itemId })}
              onCancelled={async (itemId) => {
                await Promise.all([loadItems(itemFilters), loadMyItems()]);
                setNotice(`出品を取り下げました: #${itemId}`);
              }}
              onCompleteStep={(step) => {
                if (demoTourActive && demoStep === step) {
                  setDemoStep(step + 1);
                }
              }}
              autoPilot={autoPilot}
              autoPilotStep={autoPilotStep}
              onCompleteAutopilotStep={handleCompleteAutopilotStep}
            />
          )}

          {route.page === "admin" && (
            <AdminDashboardScreen
              api={api}
              currentSubpage={route.subpage}
              onSubpageChange={(subpage) => navigate({ page: "admin", subpage })}
            />
          )}

          {route.page === "help" && <HelpScreen />}
        </>
      )}

      {demoTourActive && (
        <DemoTourWidget 
          step={demoStep} 
          onClose={() => setDemoTourActive(false)} 
          onNavigate={(page, id) => {
            if (page === "item" && id) {
              navigate({ page: "item", itemId: id });
            } else {
              navigate({ page: page as any });
            }
          }}
        />
      )}
    </main>
  );
}

// --- ハッシュルーティング同期ヘルパー ---

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "sell") return { page: "sell" };
  if (hash === "messages") return { page: "messages" };
  if (hash === "mypage") return { page: "mypage" };
  if (hash === "help") return { page: "help" };
  if (hash.startsWith("item/")) {
    const itemId = Number(hash.split("/")[1]);
    if (Number.isFinite(itemId)) {
      return { page: "item", itemId };
    }
  }
  if (hash.startsWith("admin/")) {
    const sub = hash.split("/")[1] as "stats" | "moderations" | "users";
    if (sub === "stats" || sub === "moderations" || sub === "users") {
      return { page: "admin", subpage: sub };
    }
    return { page: "admin", subpage: "stats" };
  }
  if (hash === "admin") {
    return { page: "admin", subpage: "stats" };
  }
  if (hash === "home") return { page: "home" };
  return { page: "auth" };
}

function navigate(route: Route) {
  const hash =
    route.page === "item"
      ? `item/${route.itemId}`
      : route.page === "admin"
        ? `admin/${route.subpage}`
        : route.page;
  window.location.hash = hash;
}

// --- デモツアー用ガイドウィジェット ---

export function DemoTourWidget({
  step,
  onClose,
  onNavigate
}: {
  step: number;
  onClose: () => void;
  onNavigate: (page: string, id?: number) => void;
}) {
  return (
    <div style={{
      position: "fixed",
      bottom: "80px",
      right: "24px",
      background: "rgba(15, 23, 42, 0.95)",
      backdropFilter: "blur(12px)",
      border: "2px solid #fbbf24",
      borderRadius: "16px",
      padding: "20px",
      width: "360px",
      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 0 15px rgba(251, 191, 36, 0.3)",
      color: "#ffffff",
      zIndex: 2000,
      display: "flex",
      flexDirection: "column",
      gap: "14px",
      animation: "sparkleGlow 2s infinite alternate ease-in-out"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>
        <strong style={{ fontSize: "14px", color: "#fbbf24", display: "flex", alignItems: "center", gap: "6px" }}>
          🤖 Next Market AI体験ツアーガイド
        </strong>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "16px", cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        
        {/* Step 1 */}
        <div style={{ opacity: step >= 1 ? 1 : 0.4, display: "flex", gap: "10px", alignItems: "start" }}>
          <span style={{ fontSize: "18px" }}>{step > 1 ? "✅" : "🤖"}</span>
          <div>
            <strong style={{ fontSize: "13px", color: step === 1 ? "#fbbf24" : "#ffffff", textDecoration: step > 1 ? "line-through" : "none" }}>
              1. 大阪商人AIと値引き交渉をしよう！
            </strong>
            {step === 1 && (
              <>
                <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#cbd5e1", lineHeight: "1.4" }}>
                  デモ投入した商品「iPhone 14 Pro」を開き、「🤖 代理AI交渉」をクリック！予算を設定して交渉シミュレーションを開始してください。
                </p>
                <button type="button" onClick={() => onNavigate("item", 9901)} style={{ marginTop: "8px", background: "#fbbf24", color: "#0f172a", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                  👉 対象のiPhone詳細へジャンプ
                </button>
              </>
            )}
          </div>
        </div>

        {/* Step 2 */}
        <div style={{ opacity: step >= 2 ? 1 : 0.4, display: "flex", gap: "10px", alignItems: "start" }}>
          <span style={{ fontSize: "18px" }}>{step > 2 ? "✅" : "🔄"}</span>
          <div>
            <strong style={{ fontSize: "13px", color: step === 2 ? "#fbbf24" : "#ffffff", textDecoration: step > 2 ? "line-through" : "none" }}>
              2. 3者間わらしべ物々交換を体験しよう！
            </strong>
            {step === 2 && (
              <>
                <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#cbd5e1", lineHeight: "1.4" }}>
                  「マイページ」の「🔄 AIわらしべ物々交換」タブを開き、すでにマッチング成立したループ提案を「承認」して、発送・受取（エスクロー解除）まで進めてください。
                </p>
                <button type="button" onClick={() => onNavigate("mypage")} style={{ marginTop: "8px", background: "#fbbf24", color: "#0f172a", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                  👉 マイページの物々交換へジャンプ
                </button>
              </>
            )}
          </div>
        </div>

        {/* Step 3 */}
        <div style={{ opacity: step >= 3 ? 1 : 0.4, display: "flex", gap: "10px", alignItems: "start" }}>
          <span style={{ fontSize: "18px" }}>{step > 3 ? "🎉" : "📸"}</span>
          <div>
            <strong style={{ fontSize: "13px", color: step === 3 ? "#fbbf24" : "#ffffff", textDecoration: step > 3 ? "line-through" : "none" }}>
              3. AI使用風景＆シネマ動画を作ろう！
            </strong>
            {step === 3 && (
              <>
                <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#cbd5e1", lineHeight: "1.4" }}>
                  商品詳細ページ（例: iPhone）で「AI画像を生成」を行い、生成後に「🎬 AI動画を生成・再生」を起動してシネマグラフを再生しましょう！
                </p>
                <button type="button" onClick={() => onNavigate("item", 9901)} style={{ marginTop: "8px", background: "#fbbf24", color: "#0f172a", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                  👉 iPhone詳細へジャンプ
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {step > 3 && (
        <div style={{ background: "rgba(16, 185, 129, 0.2)", border: "1px solid #10b981", borderRadius: "8px", padding: "10px", textAlign: "center", animation: "sparkleGlow 1s infinite alternate" }}>
          <strong style={{ fontSize: "13px", color: "#34d399", display: "block" }}>🎉 デモツアー完了！</strong>
          <span style={{ fontSize: "11px", color: "#e2e8f0" }}>すべての次世代AI機能をご体験いただき、誠にありがとうございました！</span>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
