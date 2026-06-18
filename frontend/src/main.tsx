import React, { useState, useEffect, useRef, FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  Bot,
  CircleOff,
  ChevronRight,
  Heart,
  HelpCircle,
  Home,
  ImagePlus,
  LogIn,
  LogOut,
  MessageCircle,
  PackagePlus,
  Search,
  Send,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  UploadCloud,
  UserCircle2,
  Users,
  WalletCards
} from "lucide-react";

// Import modular types and components
import { User, Item, Conversation, Message, UserReview, ItemScene, Route, NavPage, NavItem, PersonalStats, getPublicUrl } from "./types";
import { StripePaymentModal } from "./StripePaymentModal";
import { HelpScreen } from "./HelpScreen";
import { AdminDashboardScreen } from "./AdminDashboardScreen";
import { MyPageScreen } from "./MyPageScreen";

const API_BASE = "/api";

function MarkdownBlock({ text, className }: { text: string; className?: string }) {
  return <div className={className ? `markdown-block ${className}` : "markdown-block"} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

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

const CATEGORIES = ["家電・スマホ", "衣服・ファッション", "本・ゲーム・エンタメ", "おもちゃ・ホビー", "スポーツ・レジャー", "ハンドメイド", "その他"];

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) as User : null;
  });

  const [route, setRoute] = useState<Route>(readRoute);
  const [notice, setNotice] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [itemFilters, setItemFilters] = useState({ q: "", category: "", min_price: "", max_price: "" });

  const [myItems, setMyItems] = useState<Item[]>([]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Demo Tour States
  const [demoTourActive, setDemoTourActive] = useState(false);
  const [demoStep, setDemoStep] = useState(1);

  // Autopilot Guided Tour States
  const [autoPilot, setAutoPilot] = useState(false);
  const [autoPilotStep, setAutoPilotStep] = useState(0);
  const [autoPilotPrompt, setAutoPilotPrompt] = useState("");

  useEffect(() => {
    function syncRoute() {
      setRoute(readRoute());
    }
    window.addEventListener("hashchange", syncRoute);
    syncRoute();
    return () => window.removeEventListener("hashchange", syncRoute);
  }, [token]);

  const handleCompleteAutopilotStep = (step: number) => {
    if (!autoPilot) return;

    if (step === 3) {
      setAutoPilotStep(4);
    } else if (step === 7) {
      setAutoPilotStep(8);
    } else if (step === 8) {
      setAutoPilotStep(9);
    }
  };

  // Autopilot Director Core Hook
  useEffect(() => {
    if (!autoPilot) return;

    let timer: any;
    switch (autoPilotStep) {
      case 1:
        setAutoPilotPrompt("🚀 [1/9] iPhone 14 Pro 詳細ページへ自動テレポート中...");
        timer = setTimeout(() => {
          navigate({ page: "item", itemId: 9901 });
          setAutoPilotStep(2);
        }, 2200);
        break;
      case 2:
        setAutoPilotPrompt("🤖 [2/9] 大阪商人交渉AIとの自律価格交渉室をロード中...");
        timer = setTimeout(() => {
          setAutoPilotStep(3);
        }, 2800);
        break;
      case 3:
        setAutoPilotPrompt("💬 [3/9] お互いの意思決定AI同士で値下げ・購入合意を自律交渉中（完了を検知します）...");
        // Event-driven: No timer! Advanced by handleCompleteAutopilotStep(3)
        break;
      case 4:
        setAutoPilotPrompt("🔒 [4/9] Stripeエスクロー決済成立を確認。DMs取引ナビへ遷移します...");
        timer = setTimeout(() => {
          navigate({ page: "messages" });
          setSelectedConversationId(999);
          setAutoPilotStep(5);
        }, 4500);
        break;
      case 5:
        setAutoPilotPrompt("🔄 [5/9] マイページの「AIわらしべ物々交換」ボードを開きます...");
        timer = setTimeout(() => {
          navigate({ page: "mypage" });
          setAutoPilotStep(6);
        }, 4000);
        break;
      case 6:
        setAutoPilotPrompt("🤝 [6/9] マッチング成立中の等価循環ループを自動『承認』します...");
        timer = setTimeout(() => {
          setAutoPilotStep(7);
        }, 4500);
        break;
      case 7:
        setAutoPilotPrompt("🚚 [7/9] 3者間での商品配送・受領・売上金の確定を自律処理中（完了を検知します）...");
        // Event-driven: No timer! Advanced by handleCompleteAutopilotStep(7)
        break;
      case 8:
        setAutoPilotPrompt("📸 [8/9] 生成AI（DALL-E & シネマグラフ）による写真・動画を生成中（完了を検知します）...");
        // Event-driven: No timer! Advanced by handleCompleteAutopilotStep(8)
        break;
      case 9:
        setAutoPilotPrompt("🎉 [9/9] デモツアー完了！ご清聴ありがとうございました！");
        timer = setTimeout(() => {
          alert("🎉 フルオート・デモツアー完了！\nすべての次世代AI機能とStripeエスクロー決済シミュレーションをご体験いただき、誠にありがとうございました！\nNext Marketはハッカソン本番で最高品質の評価を獲得できるレベルで完全に実稼働します。");
          setAutoPilot(false);
          setAutoPilotStep(0);
          setAutoPilotPrompt("");
          navigate({ page: "home" });
        }, 5500);
        break;
    }

    return () => clearTimeout(timer);
  }, [autoPilot, autoPilotStep]);

  const selectedItem = route.page === "item" ? items.find((item) => item.id === route.itemId) ?? null : null;
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const activeCount = items.filter((item) => item.status === "active").length;
  const soldCount = items.filter((item) => item.status === "sold").length;
  const likedTotal = items.reduce((sum, item) => sum + item.likeCount, 0);

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "API error");
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
    setNotice(`${nextUser.name} さん、ようこそ`);
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
          <span>🔴 AUTOPILOT TOUR ACTIVE: {autoPilotPrompt}</span>
        </div>
      )}
      {notice && (
        <div className="system-notice" style={{ animation: "sparkleGlow 1s alternate" }}>
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>✕</button>
        </div>
      )}

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
                onClick={() => navigate({ page: "admin", subpage: "stats" })}
                style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", fontSize: "12px", padding: "6px 12px", cursor: "pointer" }}
              >
                🛡️ 管理画面
              </button>
            )}
            <IconLabel icon={UserCircle2} label={user?.name ?? "User"} value={user?.email?.split("@")[0] ?? ""} className="session-badge" />
            <button className="ghost-button" onClick={logout}>
              <IconLabel icon={LogOut} label="終了" />
            </button>
          </div>
        </header>
      )}

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
              onCreated={async (item) => {
                await Promise.all([loadItems(itemFilters), loadMyItems()]);
                setNotice(`出品しました: ${item.title}`);
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

      {user && (
        <nav className="footer-nav">
          {PRIMARY_NAV.map((nav) => (
            <button
              key={nav.page}
              className={route.page === nav.page ? "nav-link active" : "nav-link"}
              onClick={() => navigate({ page: nav.page })}
            >
              <nav.icon size={20} />
              <span>{nav.label}</span>
            </button>
          ))}
        </nav>
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

function normalizeRoute(route: Route, authenticated: boolean): Route {
  if (!authenticated) return { page: "auth" };
  return route.page === "auth" ? { page: "home" } : route;
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

function formatDate(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.toString() : date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function statusLabel(status: Item["status"] | Conversation["itemStatus"]) {
  if (status === "sold") return "売却済み";
  if (status === "hidden") return "公開停止";
  return "販売中";
}

function AuthScreen({
  onSessionUpdated,
  notice
}: {
  onSessionUpdated: (token: string, user: User) => void;
  notice: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("Toshi");
  const [email, setEmail] = useState("toshi@example.com");
  const [password, setPassword] = useState("secret");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    e_prevent(event);
    setLoading(true);
    setError("");
    try {
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const payload = mode === "register" ? { name, email, password } : { email, password };
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "API auth failure");
      }
      onSessionUpdated(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "認証に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const e_prevent = (e: FormEvent) => e.preventDefault();

  return (
    <section className="auth-layout">
      <div className="auth-hero">
        <p className="eyebrow">Next Market</p>
        <h1>フリマ体験を、最初の一画面から整える。</h1>
        <p className="lede">AI交渉エージェントから、マルチホップ物々交換、Stripeエスクロー、AI自動写真補正まで完備した最先端フリマ</p>
        <div className="auth-points">
          <article>
            <IconLabel icon={Store} label="探す" />
          </article>
          <article>
            <IconLabel icon={PackagePlus} label="売る" />
          </article>
          <article>
            <IconLabel icon={MessageCircle} label="話す" />
          </article>
        </div>
      </div>

      <section className="auth-card panel">
        <div className="panel-heading">
          <LogIn size={20} />
          <h2>{mode === "register" ? "新規登録" : "ログイン"}</h2>
        </div>
        <div className="segmented">
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            新規登録
          </button>
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            ログイン
          </button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {mode === "register" && (
            <div className="input-group">
              <label>お名前</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="input-group">
            <label>メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>パスワード (6文字以上)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="primary-button" disabled={loading} type="submit" style={{ padding: "14px", width: "100%" }}>
            <LogIn size={18} />
            {loading ? "通信中..." : mode === "register" ? "無料でアカウントを作成" : "ログインする"}
          </button>
        </form>

        {error && <p className="error" style={{ marginTop: "12px" }}>{error}</p>}
        {notice && <p className="notice inline-notice" style={{ marginTop: "12px" }}>{notice}</p>}

        {/* Unsecured Password Override Tool (Demo Debugger) */}
        <details style={{ marginTop: "24px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "12px" }}>
          <summary style={{ fontSize: "12px", fontWeight: "bold", color: "#64748b", cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>⚠️ デモ専用：パスワード無条件変更（開発者ツール）</span>
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            <p style={{ margin: 0, fontSize: "11px", color: "#64748b", lineHeight: "1.4" }}>
              任意のメールアドレスのパスワードを無条件で上書き・強制更新します。（アカウントが存在しない場合は自動で新規登録されます）
            </p>
            <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
              <input
                type="email"
                placeholder="対象メールアドレス (例: taishi@example.com)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ padding: "8px", fontSize: "12px", borderRadius: "6px", width: "100%" }}
              />
              <input
                type="password"
                placeholder="新しいパスワード (6文字以上)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ padding: "8px", fontSize: "12px", borderRadius: "6px", width: "100%" }}
              />
              <button
                type="button"
                className="primary-button"
                style={{ background: "#d85b46", color: "#fff", border: "none", padding: "10px 14px", fontSize: "12px", cursor: "pointer", alignSelf: "start", width: "100%" }}
                onClick={async () => {
                  if (!email || password.length < 6) {
                    alert("メールアドレスと、6文字以上の新しいパスワードを入力してください。");
                    return;
                  }
                  try {
                    const res = await fetch("/api/auth/reset-demo", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email, password })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "リセットに失敗しました");
                    alert(`🔐 データベース書き換え成功！\n${data.message}`);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "パスワード更新に失敗しました");
                  }
                }}
              >
                ⚡ データベースを強制上書き（更新）
              </button>
            </div>
          </div>
        </details>
      </section>
    </section>
  );
}

function HomeScreen({
  items,
  itemsLoading,
  itemsError,
  filters,
  onFiltersChange,
  onOpenItem,
  onRunDemo
}: {
  items: Item[];
  itemsLoading: boolean;
  itemsError: string;
  filters: { q: string; category: string; min_price: string; max_price: string };
  onFiltersChange: (filters: { q: string; category: string; min_price: string; max_price: string }) => void;
  onOpenItem: (itemId: number) => void;
  onRunDemo?: () => void;
}) {
  return (
    <section className="screen home-screen">
      <div className="hero-banner">
        <h2>次世代AI交渉 ＆ わらしべ物々交換フリマ</h2>
        <p>エージェント交渉からマルチホップ物々交換、AI写真編集、Stripeエスクローまで完備した最先端フリマ</p>
        {onRunDemo && (
          <button 
            onClick={onRunDemo} 
            style={{ 
              marginTop: "16px", 
              background: "linear-gradient(135deg, #fbbf24, #d85b46)", 
              color: "#ffffff", 
              border: "none", 
              padding: "12px 24px", 
              borderRadius: "30px", 
              fontWeight: 700, 
              fontSize: "14px", 
              cursor: "pointer", 
              boxShadow: "0 4px 15px rgba(216, 91, 70, 0.4)",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <Sparkles size={16} /> ⚡ デモデータを自動投入（デモを実行）
          </button>
        )}
      </div>

      <div className="search-row">
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="欲しい商品名で検索..."
            value={filters.q}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
          />
        </div>
        <select
          value={filters.category}
          onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
        >
          <option value="">すべてのカテゴリー</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {itemsLoading ? (
        <div className="loading-state">商品をロード中...</div>
      ) : itemsError ? (
        <p className="error">{itemsError}</p>
      ) : (
        <section className="catalog-grid">
          {items.map((item) => (
            <article key={item.id} className="catalog-card" onClick={() => onOpenItem(item.id)}>
              <img src={getPublicUrl(item.imageUrl) || "/placeholder.svg"} alt="" />
              <div className="catalog-card-body">
                <strong>{item.title}</strong>
                <span>¥{item.price.toLocaleString()}</span>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#7d8b99", marginTop: "4px" }}>
                  <span>{item.category}</span>
                  {item.barterEnabled && <span style={{ color: "#d85b46", fontWeight: "bold" }}>🔄 物々交換OK</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#5c6b73", borderTop: "1px solid #eadfd3", paddingTop: "6px", marginTop: "6px" }}>
                  <span>⭐ {item.sellerRatingAvg.toFixed(1)} ({item.sellerRatingCount})</span>
                  <span>❤️ {item.likeCount}</span>
                </div>
              </div>
            </article>
          ))}
          {items.length === 0 && <p className="muted">一致する商品は見つかりませんでした。</p>}
        </section>
      )}
    </section>
  );
}

function SellScreen({
  api,
  onCreated
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onCreated: (item: Item) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("衣服・ファッション");
  const [price, setPrice] = useState(3000);
  const [minPrice, setMinPrice] = useState(2000);
  const [aiPersonality, setAiPersonality] = useState<"standard" | "osaka" | "cool" | "anime">("standard");
  const [barterEnabled, setBarterEnabled] = useState(false);
  const [wantCategory, setWantCategory] = useState("家電・スマホ");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedMsg, setSuggestedMsg] = useState("");

  async function suggestPriceAndDescribe() {
    if (!title) {
      alert("AIに査定・説明文を書いてもらうには、まず「商品名」を1文字以上入力してください！");
      return;
    }
    setSuggesting(true);
    setSuggestedMsg("");
    try {
      const pData = await api<any>("/ai/suggest-price", {
        method: "POST",
        body: JSON.stringify({ title, category, condition: "未使用に近い", notes: "美品、即購入OK" })
      });
      setPrice(pData.price);
      setMinPrice(pData.minPrice);
      setSuggestedMsg(`🔮 AI査定完了: 推奨価格 ¥${pData.price.toLocaleString()} (理由: ${pData.reason})`);

      const dData = await api<{ description: string }>("/ai/generate-description", {
        method: "POST",
        body: JSON.stringify({ title, category, condition: "未使用に近い", notes: "美品、即購入OK" })
      });
      setDescription(dData.description);
    } catch (err) {
      alert("AI自動査定に失敗しました");
    } finally {
      setSuggesting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (imageFiles.length === 0) {
      alert("商品の写真を1枚以上アップロードしてください。");
      return;
    }
    setSaving(true);
    try {
      const urls: string[] = [];
      for (const file of imageFiles) {
        const signed = await api<{ uploadUrl: string; publicUrl: string }>("/upload", {
          method: "POST",
          body: JSON.stringify({ filename: file.name, contentType: file.type })
        });
        const uploadResponse = await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file
        });
        if (!uploadResponse.ok) throw new Error("GCS Upload failed");
        urls.push(signed.publicUrl);
      }

      const item = await api<{ item: Item }>("/items", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          category,
          price,
          minPrice,
          aiPersonality,
          barterEnabled,
          wantCategory,
          imageUrls: urls
        })
      });
      await onCreated(item.item);
    } catch (err) {
      alert(err instanceof Error ? err.message : "出品に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen sell-screen">
      <div className="section-head">
        <div>
          <p className="eyebrow">Sell Item</p>
          <h2>新規出品</h2>
        </div>
      </div>

      <form onSubmit={submit} className="panel sell-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div className="input-group">
          <label>商品名</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="ルイヴィトンの折りたたみ財布" />
          <button type="button" disabled={suggesting} onClick={suggestPriceAndDescribe} style={{ background: "linear-gradient(135deg, #d85b46, #e06e57)", color: "#fff", border: "none", alignSelf: "start", marginTop: "8px", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
            <Sparkles size={14} /> {suggesting ? "AIが推敲・価格査定中..." : "OpenAIで自動査定＆説明文作成"}
          </button>
          {suggestedMsg && <p className="notice" style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#047857" }}>{suggestedMsg}</p>}
        </div>

        <div className="input-group">
          <label>商品説明 (Markdown対応)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={6} placeholder="商品の状態や仕様をご記入ください。AIが生成したテキストを調整することも可能です。" />
        </div>

        {/* Category tags selector */}
        <div className="input-group">
          <label>カテゴリー</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                style={{
                  background: category === cat ? "#d85b46" : "#f1f5f9",
                  color: category === cat ? "#ffffff" : "#1f2937",
                  border: "1px solid #eadfd3",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  transition: "all 0.15s ease"
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div className="input-group">
            <label>出品希望価格 (¥)</label>
            <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} required />
          </div>
          <div className="input-group">
            <label>最低売却許容価格 (¥・極秘)</label>
            <input type="number" value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))} required />
            <small style={{ color: "#7d8b99" }}>※AI交渉エージェントが、これ未満での値下げ交渉を完全にブロックします。</small>
          </div>
        </div>

        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div className="input-group">
            <label>交渉代理AIの性格</label>
            <select value={aiPersonality} onChange={(e: any) => setAiPersonality(e.target.value)}>
              <option value="standard">標準・丁寧（standard）</option>
              <option value="osaka">コテコテの大阪商人（osaka）</option>
              <option value="cool">冷静エリートエリート（cool）</option>
              <option value="anime">元気でかわいいアニメキャラ（anime）</option>
            </select>
          </div>
          <div className="input-group" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "24px" }}>
              <input type="checkbox" checked={barterEnabled} onChange={(e) => setBarterEnabled(e.target.checked)} />
              <strong style={{ fontSize: "14px" }}>🔄 わらしべ物々交換を許可する</strong>
            </label>
          </div>
        </div>

        {barterEnabled && (
          <div className="input-group" style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1", animation: "sparkleGlow 0.5s" }}>
            <label style={{ fontWeight: "bold" }}>交換で最も欲しいカテゴリー</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setWantCategory(cat)}
                  style={{
                    background: wantCategory === cat ? "#3b82f6" : "#ffffff",
                    color: wantCategory === cat ? "#ffffff" : "#1f2933",
                    border: "1px solid #cbd5e1",
                    padding: "6px 12px",
                    borderRadius: "20px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                    transition: "all 0.15s ease"
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
            <small style={{ color: "#64748b", display: "block", marginTop: "8px" }}>※このカテゴリーの商品を売りたい人と、AIが物々交換の閉路（Loop）を自動走査・マッチングします。</small>
          </div>
        )}

        <div className="input-group">
          <label>商品画像アップロード</label>
          <label className="upload-drop">
            <UploadCloud size={32} />
            <span>{imageFiles.length > 0 ? `${imageFiles.length}枚の画像を選択済み` : "商品画像を選択 (JPG / PNG)"}</span>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
            />
          </label>
        </div>

        <button className="primary-button" disabled={saving} type="submit" style={{ padding: "14px", marginTop: "12px" }}>
          {saving ? "出品登録をアップロード中..." : "商品を出品する"}
        </button>
      </form>
    </section>
  );
}

function ItemDetailScreen({
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
}: {
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
}) {
  const [question, setQuestion] = useState("通勤用として雨の日にも使えそう？");
  const [answer, setAnswer] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAIError] = useState("");
  const [cancelling, setCancelling] = useState(false);
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

  // Autopilot Actions inside Item Detail
  useEffect(() => {
    if (!autoPilot) return;

    if (autoPilotStep === 2) {
      setBuyerBudget(80000);
      setShowNegotiation(true);
    } else if (autoPilotStep === 3) {
      // Auto-trigger the negotiation
      const timer = setTimeout(() => {
        startNegotiation();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoPilot, autoPilotStep]);

  useEffect(() => {
    if (!autoPilot || autoPilotStep !== 8) return;

    // Generate AI Scene image immediately
    const timer = setTimeout(() => {
      generateScene().then(() => {
        // Once the image is generated, wait 2.2 seconds and generate the Cinema Video!
        setTimeout(() => {
          generateSceneVideo().then(() => {
            // Wait 5.5 seconds for the user to enjoy the live movie cinemagraph!
            setTimeout(() => {
              if (onCompleteAutopilotStep) onCompleteAutopilotStep(8);
            }, 5500);
          });
        }, 2200);
      });
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
          <button className="ghost-button" onClick={onBack}>
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
      setSceneError(err instanceof Error ? err.message : "AI画像の読み込みに失敗しました");
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
      setAIError(err instanceof Error ? err.message : "AI回答の取得に失敗しました");
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
      setSceneError(err instanceof Error ? err.message : "AI画像の生成に失敗しました");
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
      setVideoError(err instanceof Error ? err.message : "AI動画の生成に失敗しました");
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
              onCompleteAutopilotStep(3);
            }, 3000);
          }
        } else {
          setDialogueIndex(idx);
        }
      }, 1500); // 1.5s delay to slide in dialogue boxes beautifully!
    } catch (err) {
      setNegError(err instanceof Error ? err.message : "代理交渉の開始に失敗しました");
    } finally {
      setNegotiating(false);
    }
  };

  return (
    <section className="screen item-detail-screen">
      <div className="section-head">
        <button className="ghost-button" onClick={onBack}>← ホームへ戻る</button>
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
          </div>

          <div style={{ display: "flex", gap: "12px", borderTop: "1px solid #eadfd3", borderBottom: "1px solid #eadfd3", padding: "12px 0" }}>
            <span style={{ fontSize: "14px" }}>⭐ {currentItem.sellerRatingAvg.toFixed(1)} ({currentItem.sellerRatingCount}件の評価)</span>
            <span style={{ fontSize: "14px" }}>❤️ {currentItem.likeCount} いいね</span>
          </div>

          <div className="detail-actions">
            <button className="ghost-button" onClick={like}>❤️ いいねする</button>
            {user?.id !== currentItem.sellerId && currentItem.status === "active" && (
              <>
                <button className="primary-button" onClick={purchase}>💳 クレジットカードで購入する</button>
                <button className="primary-button" style={{ background: "linear-gradient(135deg, #d85b46, #e06e57)" }} onClick={() => setShowNegotiation(true)}>
                  🤖 代理AI交渉で購入する
                </button>
                <button className="ghost-button" onClick={messageSeller}>💬 出品者とチャットする</button>
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
            <button className="ai-button" disabled={!user || sceneLoading} onClick={() => void generateScene()} style={{ flex: 1 }}>
              <ImagePlus size={18} />
              {sceneLoading ? "生成中..." : scene ? "AI画像再生成" : "AI画像を生成"}
            </button>
            {scene && (
              <button className="ai-button" disabled={!user || videoLoading} onClick={isPlayingVideo ? () => setIsPlayingVideo(false) : generateSceneVideo} style={{ flex: 1, background: isPlayingVideo ? "#eadfd3" : "#d85b46", color: isPlayingVideo ? "#1f2933" : "#ffffff", borderColor: isPlayingVideo ? "#eadfd3" : "#d85b46" }}>
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
            <button className="ai-button" disabled={loadingAI} onClick={askAI}>
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

      {showNegotiation && (
        <div className="negotiation-modal-backdrop" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div className="negotiation-modal-content" style={{ background: "#fffdf9", borderRadius: "12px", border: "2px solid #eadfd3", padding: "24px", width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eadfd3", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={20} style={{ color: "#d85b46" }} />
                <h3 style={{ margin: 0, color: "#1f2933" }}>AI代理価格交渉（エージェント・フリマ）</h3>
              </div>
              <button className="ghost-button" onClick={() => { setShowNegotiation(false); setNegotiationResult(null); }} style={{ padding: "4px" }}>✕</button>
            </div>

            {!negotiationResult && !negotiating ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <p style={{ margin: 0, color: "#5c6b73", fontSize: "14px", lineHeight: "1.5" }}>
                  「希望予算」と「欲しい度」を設定して、あなたの代理AIエージェントに値下げ交渉を任せましょう。<br />
                  出品者側の代理AI（性格：<strong>{item.aiPersonality === "osaka" ? "コテコテの大阪商人" : item.aiPersonality === "cool" ? "冷静沈着エリート" : item.aiPersonality === "anime" ? "元気でかわいいアニメキャラ" : "標準・丁寧"}</strong>）と自律的にチャット交渉を行い、合意すれば自動で購入が確定します！
                </p>
                <div className="two-col" style={{ display: "grid", gap: "16px", gridTemplateColumns: "1fr 1fr" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#1f2933" }}>希望購入価格（予算）</label>
                    <input value={buyerBudget} onChange={(e) => setBuyerBudget(Number(e.target.value))} type="number" style={{ width: "100%" }} />
                    <small style={{ color: "#7d8b99" }}>出品価格: ¥{item.price.toLocaleString()}</small>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#1f2933" }}>どうしても欲しい度</label>
                    <select value={desireLevel} onChange={(e: any) => setDesireLevel(e.target.value)}>
                      <option value="low">普通（予算を厳守）</option>
                      <option value="medium">強め（予算の5%超過まで許容）</option>
                      <option value="high">絶対欲しい（予算の10%超過まで許容）</option>
                    </select>
                  </div>
                </div>
                <button className="primary-button" onClick={startNegotiation} style={{ padding: "14px", marginTop: "8px" }}>
                  🤖 代理AI交渉を開始する
                </button>
              </div>
            ) : negotiating ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: "16px" }}>
                <div className="updating-spinner" style={{ fontSize: "36px" }}>🤖</div>
                <strong style={{ fontSize: "16px", color: "#1f2933" }}>AIエージェント間で自律価格交渉中（1ターンシミュレート）...</strong>
                <p style={{ margin: 0, color: "#7d8b99", fontSize: "13px", textAlign: "center" }}>
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

                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "40vh", overflowY: "auto", padding: "10px", border: "1px solid #eadfd3", borderRadius: "8px", background: "#faf8f5" }}>
                      {res.dialogue.slice(0, dialogueIndex + 1).map((chat, i) => (
                        <div key={i} className={`chat-bubble-anim ${chat.speaker === "buyer" ? "buyer-chat" : "seller-chat"}`} style={{ display: "flex", flexDirection: "column", alignSelf: chat.speaker === "buyer" ? "flex-start" : "flex-end", maxWidth: "80%", background: chat.speaker === "buyer" ? "#f1f5f9" : "#ffefe9", border: "1px solid #eadfd3", borderRadius: "12px", padding: "12px", gap: "4px", transform: "translateY(10px)", opacity: 1, animation: "sparkleGlow 0.3s forwards" }}>
                          <span style={{ fontSize: "11px", fontWeight: "bold", color: chat.speaker === "buyer" ? "#475569" : "#d85b46" }}>
                            {chat.speaker === "buyer" ? "あなた (購入者代理AI)" : `出品者代理AI (${currentItem.sellerName} さん)`}
                          </span>
                          <p style={{ margin: 0, fontSize: "13px", color: "#1f2933" }}>{chat.text}</p>
                          <small style={{ fontSize: "10px", color: "#7d8b99", alignSelf: "flex-end" }}>提示額: ¥{chat.price.toLocaleString()} ({chat.action.toUpperCase()})</small>
                        </div>
                      ))}
                    </div>

                    {dialogueIndex < res.dialogue.length - 1 && (
                      <p style={{ margin: 0, fontSize: "12px", color: "#7d8b99", fontStyle: "italic", textAlign: "center" }}>
                        交渉は現在進行中...
                      </p>
                    )}

                    <button className="primary-button" onClick={() => { setShowNegotiation(false); setNegotiationResult(null); }} style={{ padding: "12px" }}>
                      交渉室を閉じる
                    </button>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function MessagesScreen({
  user,
  conversations,
  selectedConversation,
  messages,
  api,
  onSelect,
  onOpenItem,
  onRefreshConversations
}: {
  user: User | null;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  messages: Message[];
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onSelect: (conversationId: number) => void;
  onOpenItem: (itemId: number) => void;
  onRefreshConversations?: () => Promise<void>;
}) {
  const [body, setBody] = useState("購入前に状態をもう少し教えてください。");
  const [shippingLoading, setShippingLoading] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selectedConversation) return;
    await api(`/conversations/${selectedConversation.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
    setBody("");
    onSelect(selectedConversation.id);
  }

  async function shipItem() {
    if (!selectedConversation) return;
    setShippingLoading(true);
    try {
      await api(`/purchases/${selectedConversation.purchaseId}/ship`, { method: "POST" });
      if (onRefreshConversations) await onRefreshConversations();
      onSelect(selectedConversation.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "発送通知に失敗しました");
    } finally {
      setShippingLoading(false);
    }
  }

  async function receiveItem() {
    if (!selectedConversation) return;
    setShippingLoading(true);
    try {
      await api(`/purchases/${selectedConversation.purchaseId}/receive`, { method: "POST" });
      if (onRefreshConversations) await onRefreshConversations();
      onSelect(selectedConversation.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "受取報告に失敗しました");
    } finally {
      setShippingLoading(false);
    }
  }

  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow">Messages</p>
          <h2>DM</h2>
        </div>
      </div>

      <section className="message-layout">
        <article className="panel conversation-panel">
          <div className="panel-heading">
            <MessageCircle size={20} />
            <h3>会話一覧</h3>
          </div>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={selectedConversation?.id === conversation.id ? "conversation active" : "conversation"}
                onClick={() => onSelect(conversation.id)}
              >
                <IconLabel icon={MessageCircle} label={formatDate(conversation.updatedAt)} />
                <strong>{conversation.itemTitle}</strong>
              </button>
            ))}
            {conversations.length === 0 && <p className="muted">会話はまだありません。</p>}
          </div>
        </article>

        <article className="panel thread-panel">
          <div className="panel-heading">
            <Send size={20} />
            <h3>{selectedConversation ? selectedConversation.itemTitle : "メッセージ"}</h3>
          </div>
          {selectedConversation && (
            <button className="conversation-item-card" onClick={() => onOpenItem(selectedConversation.itemId)}>
              <img src={getPublicUrl(selectedConversation.itemImageUrl) || "/placeholder.svg"} alt="" />
              <div className="conversation-item-copy">
                <div className="conversation-counterpart">
                  <img src={getPublicUrl(selectedConversation.counterpartAvatarUrl) || "/placeholder-avatar.svg"} alt="" />
                  <strong>{selectedConversation.counterpartName}</strong>
                </div>
                <strong>{selectedConversation.itemTitle}</strong>
                <span>¥{selectedConversation.itemPrice.toLocaleString()}</span>
                <small>
                  {selectedConversation.itemCategory} / {statusLabel(selectedConversation.itemStatus)}
                </small>
              </div>
            </button>
          )}

          {/* Escrow Transaction Navigator (取引ナビ) */}
          {selectedConversation && selectedConversation.itemStatus === "sold" && selectedConversation.purchaseStatus && (
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "16px", margin: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>🤝 Stripe エスクロー取引ナビ</span>
              
              {selectedConversation.purchaseStatus === "paid" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {user?.id === selectedConversation.sellerId ? (
                    <>
                      <p style={{ margin: 0, fontSize: "13px", color: "#1e293b", lineHeight: "1.4" }}>
                        🎉 <strong>購入者の支払いが完了しました！</strong><br />
                        売上金はStripeエスクロー（一時預かり）に安全に保護されています。商品を発送し、以下の「発送通知」ボタンを押してください。
                      </p>
                      <button className="primary-button" disabled={shippingLoading} onClick={shipItem} style={{ background: "#3b82f6", color: "#fff", border: "none", alignSelf: "start", padding: "8px 16px", fontSize: "13px", cursor: "pointer" }}>
                        📦 商品を発送したので発送通知をする
                      </button>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: "13px", color: "#047857", lineHeight: "1.4" }}>
                      🔒 <strong>決済が完了しました（エスクロー保護中）</strong><br />
                      代金は取引が完了するまで運営に安全に保護されています。出品者による商品の発送をお待ちください。
                    </p>
                  )}
                </div>
              )}

              {selectedConversation.purchaseStatus === "shipped" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {user?.id === selectedConversation.sellerId ? (
                    <p style={{ margin: 0, fontSize: "13px", color: "#0369a1", lineHeight: "1.4" }}>
                      🚚 <strong>商品の発送を通知しました</strong><br />
                      商品は配送中です。購入者が受け取りを確認し、「受取評価」を行うと自動で売上残高が確定されます。
                    </p>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: "13px", color: "#1e293b", lineHeight: "1.4" }}>
                        🚚 <strong>出品者が商品を発送しました！</strong><br />
                        荷物が届いたら中身を確認し、問題がなければ「受取確認＆取引完了」ボタンを押してください。完了すると出品者へ売上金がリリースされます。
                      </p>
                      <button className="primary-button" disabled={shippingLoading} onClick={receiveItem} style={{ background: "#10b981", color: "#fff", border: "none", alignSelf: "start", padding: "8px 16px", fontSize: "13px", cursor: "pointer" }}>
                        ✅ 商品を受け取ったので取引を完了する
                      </button>
                    </>
                  )}
                </div>
              )}

              {selectedConversation.purchaseStatus === "completed" && (
                <p style={{ margin: 0, fontSize: "13px", color: "#047857", fontWeight: 600 }}>
                  🎉 この取引は完了しました！ありがとうございました。
                </p>
              )}
            </div>
          )}
          <div className="message-list">
            {messages.map((message) => (
              <p key={message.id} className={message.senderId === user?.id ? "message mine" : "message"}>
                {message.body}
              </p>
            ))}
            {selectedConversation && messages.length === 0 && <p className="muted">まだメッセージはありません。</p>}
            {!selectedConversation && <p className="muted">左の会話を選択してください。</p>}
          </div>
          <form className="message-form" onSubmit={send}>
            <input disabled={!selectedConversation} value={body} onChange={(e) => setBody(e.target.value)} />
            <button disabled={!selectedConversation}>
              <Send size={18} />
            </button>
          </form>
          {selectedConversation?.itemStatus === "sold" && (
            <ReviewComposer
              api={api}
              itemId={selectedConversation.itemId}
              counterpartName={selectedConversation.counterpartName}
            />
          )}
        </article>
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

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inList = false;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join("<br />"))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) return;
    html.push("</ul>");
    inList = false;
  };

  for (let line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushParagraph();
        closeList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);

    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    if (bullet) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(escapeHtml(bullet[1]))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      closeList();
      continue;
    }

    paragraph.push(escapeHtml(line));
  }

  flushParagraph();
  closeList();

  return html.join("\n");
}

function renderMarkdownText(text: string) {
  return renderMarkdown(text);
}

// ==========================================
// Immersive Guided Demo Tour Guide Widget
// ==========================================

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
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "16px", cursor: "pointer" }}>✕</button>
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
                <button onClick={() => onNavigate("item", 9901)} style={{ marginTop: "8px", background: "#fbbf24", color: "#0f172a", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
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
                <button onClick={() => onNavigate("mypage")} style={{ marginTop: "8px", background: "#fbbf24", color: "#0f172a", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
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
                <button onClick={() => onNavigate("item", 9901)} style={{ marginTop: "8px", background: "#fbbf24", color: "#0f172a", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
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
