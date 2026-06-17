import { FormEvent, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  CircleOff,
  ChevronRight,
  Heart,
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
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8080/api" : "/api");

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
};

type Item = {
  id: number;
  sellerId: number;
  sellerName: string;
  sellerRatingAvg: number;
  sellerReviewCount: number;
  title: string;
  description: string;
  category: string;
  price: number;
  minPrice?: number;
  aiPersonality?: string;
  status: "active" | "sold" | "hidden";
  imageUrl: string;
  likeCount: number;
  createdAt: string;
};

type ItemScene = {
  imageUrl: string;
  prompt: string;
  createdAt: string;
  isPersonal: boolean;
};

type Conversation = {
  id: number;
  itemId: number;
  itemTitle: string;
  itemPrice: number;
  itemStatus: "active" | "sold" | "hidden";
  itemImageUrl: string;
  itemCategory: string;
  buyerId: number;
  sellerId: number;
  counterpartId: number;
  counterpartName: string;
  counterpartAvatarUrl: string;
  updatedAt: string;
};

type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
};

type UserReview = {
  id: number;
  purchaseId: number;
  itemId: number;
  itemTitle: string;
  reviewerId: number;
  reviewerName: string;
  revieweeId: number;
  revieweeName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

type ItemReview = {
  prohibited: boolean;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
  blockedKeywords: string[];
};

type PriceSuggestion = {
  price: number;
  minPrice: number;
  maxPrice: number;
  reason: string;
  signals: string[];
};

type Route =
  | { page: "auth" }
  | { page: "home" }
  | { page: "sell" }
  | { page: "messages" }
  | { page: "mypage" }
  | { page: "item"; itemId: number }
  | { page: "admin"; subpage: "stats" | "moderations" | "users" };

type NavPage = "home" | "sell" | "messages" | "mypage";

type NavItem = {
  page: NavPage;
  label: string;
  icon: typeof Home;
};

const PRIMARY_NAV: NavItem[] = [
  { page: "home", label: "ホーム", icon: Home },
  { page: "sell", label: "出品", icon: PackagePlus },
  { page: "messages", label: "DM", icon: MessageCircle },
  { page: "mypage", label: "マイページ", icon: UserCircle2 }
];

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
      <Icon size={20} />
      {value !== undefined ? <strong>{value}</strong> : null}
      <small>{label}</small>
    </span>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  const [user, setUser] = useState<User | null>(loadUser());
  const [route, setRoute] = useState<Route>(() => normalizeRoute(readRoute(), Boolean(localStorage.getItem("token"))));
  const [items, setItems] = useState<Item[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [itemFilters, setItemFilters] = useState({ q: "", category: "", minPrice: "", maxPrice: "" });
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [myItems, setMyItems] = useState<Item[]>([]);

  useEffect(() => {
    void loadItems(itemFilters);
  }, [itemFilters]);

  useEffect(() => {
    if (!token) {
      setConversations([]);
      setMessages([]);
      setSelectedConversationId(null);
      setMyItems([]);
      return;
    }
    void loadConversations();
    void loadMyItems();
  }, [token]);

  useEffect(() => {
    const syncRoute = () => setRoute(normalizeRoute(readRoute(), Boolean(token)));
    window.addEventListener("hashchange", syncRoute);
    syncRoute();
    return () => window.removeEventListener("hashchange", syncRoute);
  }, [token]);

  useEffect(() => {
    if (!token) {
      navigate({ page: "auth" });
    }
  }, [token]);

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
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.category.trim()) params.set("category", filters.category.trim());
    if (filters.minPrice.trim()) params.set("min_price", filters.minPrice.trim());
    if (filters.maxPrice.trim()) params.set("max_price", filters.maxPrice.trim());
    const query = params.toString();
    try {
      const data = await api<{ items: Item[] }>(`/items${query ? `?${query}` : ""}`);
      setItems(data.items);
    } catch (err) {
      setItemsError(err instanceof Error ? err.message : "商品一覧の読み込みに失敗しました");
    } finally {
      setItemsLoading(false);
    }
  }

  async function loadConversations() {
    const data = await api<{ conversations: Conversation[] }>("/conversations");
    setConversations(data.conversations);
    if (data.conversations.length > 0) {
      setSelectedConversationId((current) => current ?? data.conversations[0].id);
    }
  }

  async function loadMyItems() {
    const data = await api<{ items: Item[] }>("/my/items");
    setMyItems(data.items);
  }

  async function loadMessages(conversationId: number) {
    setSelectedConversationId(conversationId);
    const data = await api<{ messages: Message[] }>(`/conversations/${conversationId}/messages`);
    setMessages(data.messages);
  }

  function saveSession(nextToken: string, nextUser: User) {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(nextUser));
    setNotice(`${nextUser.name} さん、ようこそ`);
    navigate({ page: "home" });
  }

  function updateSession(nextToken: string, nextUser: User) {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(nextUser));
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setNotice("ログアウトしました");
    navigate({ page: "auth" });
  }

  async function refreshItemsAndKeepSelection(itemId?: number) {
    await loadItems(itemFilters);
    if (token) {
      await loadMyItems();
    }
    if (itemId) {
      navigate({ page: "item", itemId });
    }
  }

  return (
    <main className={route.page === "auth" ? "app-shell auth-shell" : "app-shell"}>
      {route.page === "auth" ? (
        <AuthScreen api={api} onAuth={saveSession} notice={notice} />
      ) : (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">Next Market</p>
              <h1>売る。見る。話す。</h1>
            </div>
            <div className="session-card">
              <IconLabel icon={UserCircle2} label={user?.name ?? "User"} value={user?.email?.split("@")[0] ?? ""} className="session-badge" />
              <button className="ghost-button" onClick={logout}>
                <IconLabel icon={LogOut} label="終了" />
              </button>
            </div>
          </header>

          <Navigation route={route} user={user} />

          {notice && <p className="notice">{notice}</p>}

          {route.page === "home" && (
            <HomeScreen
              items={items}
              filters={itemFilters}
              loading={itemsLoading}
              error={itemsError}
              activeCount={activeCount}
              soldCount={soldCount}
              likedTotal={likedTotal}
              onFilterChange={setItemFilters}
              onOpenItem={(itemId) => navigate({ page: "item", itemId })}
              onOpenSell={() => navigate({ page: "sell" })}
              onOpenMessages={() => navigate({ page: "messages" })}
            />
          )}

          {route.page === "sell" && (
            <CreateItemScreen
              api={api}
              onCreated={(item) => {
                setItems((current) => [item, ...current]);
                void loadMyItems();
                setNotice("商品を出品しました");
                navigate({ page: "item", itemId: item.id });
              }}
            />
          )}

          {route.page === "item" && (
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
            />
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
            />
          )}

          {route.page === "mypage" && (
            <MyPageScreen
              user={user}
              myItems={myItems}
              api={api}
              onSessionUpdated={updateSession}
              onOpenSell={() => navigate({ page: "sell" })}
              onOpenItem={(itemId) => navigate({ page: "item", itemId })}
              onCancelled={async (itemId) => {
                await Promise.all([loadItems(itemFilters), loadMyItems()]);
                setNotice(`出品を取り下げました: #${itemId}`);
              }}
            />
          )}

          {route.page === "admin" && (
            <AdminDashboardScreen
              api={api}
              currentSubpage={route.subpage}
              onSubpageChange={(subpage) => navigate({ page: "admin", subpage })}
            />
          )}
        </>
      )}
    </main>
  );
}

function AuthScreen({
  api,
  onAuth,
  notice
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onAuth: (token: string, user: User) => void;
  notice: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("Toshi");
  const [email, setEmail] = useState("toshi@example.com");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api<{ token: string; user: User }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password })
      });
      onAuth(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "認証に失敗しました");
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-hero">
        <p className="eyebrow">Next Market</p>
        <h1>フリマ体験を、最初の一画面から整える。</h1>
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
        <form onSubmit={submit}>
          {mode === "register" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名前" />}
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メール" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" type="password" />
          <button className="primary-button" type="submit">
            <LogIn size={18} />
            {mode === "register" ? "登録してはじめる" : "ログインしてホームへ"}
          </button>
        </form>
        {notice && <p className="notice inline-notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </section>
  );
}

function Navigation({ route, user }: { route: Route; user: User | null }) {
  return (
    <nav className="nav-bar">
      {PRIMARY_NAV.map((item) => {
        const Icon = item.icon;
        const active = route.page === item.page;
        return (
          <button key={item.page} className={active ? "nav-link active" : "nav-link"} onClick={() => navigate({ page: item.page })}>
            <IconLabel icon={Icon} label={item.label} />
          </button>
        );
      })}
      {user?.role === "admin" && (
        <button className={route.page === "admin" ? "nav-link active" : "nav-link"} onClick={() => navigate({ page: "admin", subpage: "stats" })}>
          <IconLabel icon={ShieldAlert} label="管理画面" />
        </button>
      )}
    </nav>
  );
}

function HomeScreen({
  items,
  filters,
  loading,
  error,
  activeCount,
  soldCount,
  likedTotal,
  onFilterChange,
  onOpenItem,
  onOpenSell,
  onOpenMessages
}: {
  items: Item[];
  filters: { q: string; category: string; minPrice: string; maxPrice: string };
  loading: boolean;
  error: string;
  activeCount: number;
  soldCount: number;
  likedTotal: number;
  onFilterChange: (filters: { q: string; category: string; minPrice: string; maxPrice: string }) => void;
  onOpenItem: (itemId: number) => void;
  onOpenSell: () => void;
  onOpenMessages: () => void;
}) {
  const leadItem = items[0] ?? null;
  const latestItems = items.slice(0, 6);

  return (
    <section className="page-shell home-shell">
      <div className="hero-card panel">
        <div className="hero-copy">
          <p className="eyebrow">Marketplace Home</p>
          <h2>ホーム</h2>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenSell}>
              <IconLabel icon={PackagePlus} label="出品" />
            </button>
            <button className="ghost-button" onClick={onOpenMessages}>
              <IconLabel icon={MessageCircle} label="DM" />
            </button>
          </div>
        </div>
        {leadItem && (
          <button className="featured-card" onClick={() => onOpenItem(leadItem.id)}>
            <img src={leadItem.imageUrl || "/placeholder.svg"} alt="" />
            <div>
              <p className="eyebrow">{leadItem.category}</p>
              <strong>{leadItem.title}</strong>
              <span>¥{leadItem.price.toLocaleString()}</span>
              <small>{leadItem.sellerName} さんが出品</small>
              <small>いいね {leadItem.likeCount}</small>
            </div>
          </button>
        )}
      </div>

      <div className="stats-grid">
        <article className="stat-card panel">
          <IconLabel icon={ShoppingBag} label="出品中" value={activeCount} />
        </article>
        <article className="stat-card panel">
          <IconLabel icon={WalletCards} label="売却済" value={soldCount} />
        </article>
        <article className="stat-card panel">
          <IconLabel icon={Heart} label="いいね" value={likedTotal} />
        </article>
      </div>

      <div className="content-grid">
        <section className="panel catalog-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">New Arrivals</p>
              <h3>新着アイテム</h3>
            </div>
          </div>
          <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
            <label className="search-field">
              <Search size={18} />
              <input
                value={filters.q}
                onChange={(e) => onFilterChange({ ...filters, q: e.target.value })}
                placeholder="商品名・説明で検索"
              />
            </label>
            <input
              value={filters.category}
              onChange={(e) => onFilterChange({ ...filters, category: e.target.value })}
              placeholder="カテゴリ"
            />
            <input
              value={filters.minPrice}
              onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value })}
              inputMode="numeric"
              placeholder="最低価格"
            />
            <input
              value={filters.maxPrice}
              onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value })}
              inputMode="numeric"
              placeholder="最高価格"
            />
          </form>
          {loading && <p className="inline-notice">商品を読み込んでいます。</p>}
          {error && <p className="error">{error}</p>}
          <div className="card-grid">
            {latestItems.map((item) => (
              <button key={item.id} className="catalog-card" onClick={() => onOpenItem(item.id)}>
                <img src={item.imageUrl || "/placeholder.svg"} alt="" />
                <div>
                  <strong>{item.title}</strong>
                  <span>¥{item.price.toLocaleString()}</span>
                  <small>
                    {item.category} / {statusLabel(item.status)}
                  </small>
                  <small>いいね {item.likeCount}</small>
                </div>
              </button>
            ))}
            {latestItems.length === 0 && <p className="muted">まだ商品がありません。</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

const CATEGORIES = [
  { value: "fashion", label: "👕 ファッション" },
  { value: "electronics", label: "💻 家電・スマホ" },
  { value: "books", label: "📚 本・エンタメ" },
  { value: "toys", label: "🧸 おもちゃ・ホビー" },
  { value: "home", label: "🏡 生活・住まい" },
  { value: "sports", label: "⚽ スポーツ" },
  { value: "other", label: "🏷️ その他" }
];

function CreateItemScreen({
  api,
  onCreated
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onCreated: (item: Item) => void;
}) {
  const [title, setTitle] = useState("撥水ミニショルダーバッグ");
  const [category, setCategory] = useState("fashion");
  const [condition, setCondition] = useState("数回使用、美品");
  const [notes, setNotes] = useState("軽い。内ポケットあり。通勤にも旅行にも使える。");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(4800);
  const [minPrice, setMinPrice] = useState(3000);
  const [aiPersonality, setAiPersonality] = useState("osaka");
  const [imageUrl, setImageUrl] = useState("https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80");
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [checkingItem, setCheckingItem] = useState(false);
  const [aiError, setAIError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [review, setReview] = useState<ItemReview | null>(null);
  const [priceSuggestion, setPriceSuggestion] = useState<PriceSuggestion | null>(null);

  useEffect(() => {
    setReview(null);
  }, [title, description, category, condition]);

  async function generateDescription() {
    setLoadingAI(true);
    setAIError("");
    try {
      const data = await api<{ description: string }>("/ai/generate-description", {
        method: "POST",
        body: JSON.stringify({ title, category, condition, notes })
      });
      setDescription(data.description);
      if (!data.description.trim()) {
        setAIError("OpenAI から空の説明文が返されました");
      }
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "説明文の生成に失敗しました");
    } finally {
      setLoadingAI(false);
    }
  }

  async function suggestPrice() {
    setLoadingPrice(true);
    setAIError("");
    setPriceSuggestion(null);
    try {
      const data = await api<{ suggestion: PriceSuggestion }>("/ai/suggest-price", {
        method: "POST",
        body: JSON.stringify({ title, category, condition, notes })
      });
      setPriceSuggestion(data.suggestion);
      setPrice(data.suggestion.price);
      setMinPrice(data.suggestion.minPrice || Math.round(data.suggestion.price * 0.7));
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "価格提案に失敗しました");
    } finally {
      setLoadingPrice(false);
    }
  }

  async function checkItem() {
    setCheckingItem(true);
    setAIError("");
    try {
      const data = await api<{ review: ItemReview }>("/ai/check-item", {
        method: "POST",
        body: JSON.stringify({ title, description, category, condition })
      });
      setReview(data.review);
      return data.review;
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "出品チェックに失敗しました");
      return null;
    } finally {
      setCheckingItem(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError("");
    const latestReview = await checkItem();
    if (!latestReview || latestReview.prohibited) return;
    try {
      const data = await api<{ item: Item }>("/items", {
        method: "POST",
        body: JSON.stringify({ title, category, description, price, minPrice, aiPersonality, imageUrl })
      });
      onCreated(data.item);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "出品に失敗しました");
    }
  }

  async function uploadImage(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const signed = await api<{ uploadUrl: string; publicUrl: string; contentType: string }>("/upload", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, contentType: file.type, purpose: "item" })
      });
      const response = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": signed.contentType },
        body: file
      });
      if (!response.ok) {
        throw new Error("画像のアップロードに失敗しました");
      }
      setImageUrl(signed.publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "画像のアップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow">Sell</p>
          <h2>出品</h2>
        </div>
        <button className="ghost-button" onClick={() => navigate({ page: "home" })}>
          <IconLabel icon={Home} label="戻る" />
        </button>
      </div>

      <section className="panel form-panel">
        <div className="panel-heading">
          <PackagePlus size={20} />
          <h3>入力</h3>
        </div>
        <form onSubmit={submit}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="商品名" />

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "8px 0 16px 0", background: "#fffdf9", border: "1px solid #eadfd3", padding: "16px", borderRadius: "8px" }}>
            <small style={{ color: "#7d8b99", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>カテゴリー（ジャンル）を選択</small>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {CATEGORIES.map((cat) => {
                const isActive = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "20px",
                      border: "1px solid #eadfd3",
                      background: isActive ? "#d85b46" : "#ffffff",
                      color: isActive ? "#ffffff" : "#1f2933",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="two-col">
            <input value={price} onChange={(e) => setPrice(Number(e.target.value))} type="number" placeholder="価格" style={{ width: "100%" }} />
            <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="状態" style={{ width: "100%" }} />
          </div>

          <div className="two-col">
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <small style={{ color: "#7d8b99", fontWeight: 600 }}>最低売却許容価格 (非公開)</small>
              <input value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))} type="number" placeholder="最低売却許容価格" style={{ width: "100%" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <small style={{ color: "#7d8b99", fontWeight: 600 }}>交渉AIの性格人格</small>
              <select value={aiPersonality} onChange={(e) => setAiPersonality(e.target.value)} className="admin-role-select w-full" style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid #eadfd3", background: "#fffdf9", height: "46px" }}>
                <option value="standard">標準・丁寧</option>
                <option value="osaka">コテコテの大阪商人</option>
                <option value="cool">冷静沈着エリートビジネスパーソン</option>
                <option value="anime">元気でかわいいアニメキャラクター</option>
              </select>
            </div>
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="AIに渡すメモ" />
          <div className="tool-row">
            <button className="ai-button" disabled={loadingAI} type="button" onClick={generateDescription}>
              <Sparkles size={18} />
              {loadingAI ? "生成中" : "OpenAIで説明生成"}
            </button>
            <button className="ai-button" disabled={loadingPrice} type="button" onClick={suggestPrice}>
              <Sparkles size={18} />
              {loadingPrice ? "提案中" : "価格を提案"}
            </button>
          </div>
          {priceSuggestion && (
            <section className="ai-result">
              <strong>推奨価格: ¥{priceSuggestion.price.toLocaleString()}</strong>
              <p>{priceSuggestion.reason}</p>
              <small>
                目安: ¥{priceSuggestion.minPrice.toLocaleString()} - ¥{priceSuggestion.maxPrice.toLocaleString()}
              </small>
            </section>
          )}
          {aiError && <p className="error">{aiError}</p>}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="商品説明" />
          {description && (
            <section className="markdown-preview">
              <p className="eyebrow">Markdown Preview</p>
              <MarkdownBlock className="preview-body" text={description} />
            </section>
          )}
          <label className="upload-drop">
            <UploadCloud size={22} />
            <span>{uploading ? "アップロード中" : "画像を選択"}</span>
            <input accept="image/*" disabled={uploading} type="file" onChange={(e) => void uploadImage(e.target.files?.[0] ?? null)} />
          </label>
          {uploadError && <p className="error">{uploadError}</p>}
          {imageUrl && (
            <div className="image-preview-row">
              <img src={imageUrl} alt="" />
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="画像URL" />
            </div>
          )}
          <button className="ghost-button" disabled={checkingItem || !description} type="button" onClick={() => void checkItem()}>
            <ShieldAlert size={18} />
            {checkingItem ? "確認中" : "出品前チェック"}
          </button>
          {review && (
            <section className={review.prohibited ? "ai-result danger" : "ai-result safe"}>
              <strong>{review.prohibited ? "出品できない可能性があります" : "出品チェックOK"}</strong>
              <p>{review.reasons.length > 0 ? review.reasons.join(" / ") : "重大な禁止事項は検出されませんでした。"}</p>
              {review.blockedKeywords.length > 0 && <small>検出語: {review.blockedKeywords.join(", ")}</small>}
            </section>
          )}
          {submitError && <p className="error">{submitError}</p>}
          <button className="primary-button" disabled={!description || uploading || checkingItem || review?.prohibited} type="submit">
            <ShoppingBag size={18} />
            {checkingItem ? "確認中" : "出品する"}
          </button>
        </form>
      </section>
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
  onConversationCreated
}: {
  item: Item | null;
  user: User | null;
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onBack: () => void;
  onChanged: (itemId: number) => void;
  onNotice: (message: string) => void;
  onConversationCreated: (conversationId: number) => Promise<void>;
}) {
  const [question, setQuestion] = useState("通勤用として雨の日にも使えそう？");
  const [answer, setAnswer] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAIError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [scene, setScene] = useState<ItemScene | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState("");

  // Negotiation Modal States
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [buyerBudget, setBuyerBudget] = useState(item ? Math.round(item.price * 0.8) : 0);
  const [desireLevel, setDesireLevel] = useState<"low" | "medium" | "high">("medium");
  const [negotiating, setNegotiating] = useState(false);
  const [negotiationResult, setNegotiationResult] = useState<{
    status: string;
    agreedPrice: number;
    purchaseId: number;
    dialogue: { speaker: "buyer" | "seller"; text: string; price: number; action: string }[];
  } | null>(null);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [negError, setNegError] = useState("");

  const timerRef = useRef<any>(null);

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

  useEffect(() => {
    setScene(null);
    setSceneError("");
    if (!user) return;
    void loadLatestScene();
  }, [currentItem.id, user?.id]);

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
      if (!data.answer.trim()) {
        setAIError("OpenAI から回答が返されませんでした");
      }
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "AIの回答取得に失敗しました");
    } finally {
      setLoadingAI(false);
    }
  }

  async function like() {
    await api(`/items/${currentItem.id}/like`, { method: "POST" });
    onNotice("いいねしました");
    onChanged(currentItem.id);
  }

  async function purchase() {
    await api(`/items/${currentItem.id}/purchase`, { method: "POST" });
    onNotice("購入が完了しました");
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

  async function cancelListing() {
    setCancelling(true);
    try {
      await api<{ item: Item }>(`/items/${currentItem.id}/cancel`, { method: "POST" });
      onNotice("出品を取り下げました");
      onChanged(currentItem.id);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "出品の取り下げに失敗しました");
    } finally {
      setCancelling(false);
    }
  }

  async function generateScene() {
    setSceneLoading(true);
    setSceneError("");
    try {
      const data = await api<{ scene: ItemScene }>(`/items/${currentItem.id}/ai-scene`, { method: "POST" });
      setScene(data.scene);
    } catch (err) {
      setSceneError(err instanceof Error ? err.message : "AI画像の生成に失敗しました");
    } finally {
      setSceneLoading(false);
    }
  }

  const startNegotiation = async () => {
    setNegotiating(true);
    setNegError("");
    setNegotiationResult(null);
    setDialogueIndex(0);
    try {
      const data = await api<{
        status: string;
        agreedPrice: number;
        purchaseId: number;
        dialogue: any[];
      }>(`/items/${currentItem.id}/negotiate`, {
        method: "POST",
        body: JSON.stringify({ buyerBudget, desireLevel }),
      });
      setNegotiationResult(data);
      // Start sequential reveal
      let index = 0;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        index++;
        if (index <= data.dialogue.length) {
          setDialogueIndex(index);
        } else {
          if (timerRef.current) clearInterval(timerRef.current);
          setNegotiating(false);
          if (data.status === "completed") {
            onNotice("AI価格交渉が成立し、自動購入されました！");
            onChanged(currentItem.id);
          } else {
            onNotice("価格交渉は決裂しました。");
          }
        }
      }, 1500); // 1.5 seconds per bubble
    } catch (err) {
      setNegError(err instanceof Error ? err.message : "交渉に失敗しました");
      setNegotiating(false);
    }
  };

  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow">Item Detail</p>
          <h2>{item.title}</h2>
          <p className="muted">
            {item.sellerName} さんの出品 / {ratingLabel(item.sellerRatingAvg, item.sellerReviewCount)}
          </p>
        </div>
        <button className="ghost-button" onClick={onBack}>
          <Home size={18} />
          ホームへ戻る
        </button>
      </div>

      <section className="detail-layout">
        <article className="panel media-panel">
          <img className="hero-image" src={item.imageUrl || "/placeholder.svg"} alt="" />
        </article>

        <article className="panel detail-panel">
          <div className="detail-title">
            <div>
              <p className="eyebrow">{item.category}</p>
              <h3>{item.title}</h3>
              <span className="rating-chip">
                <Star size={16} />
                {ratingLabel(item.sellerRatingAvg, item.sellerReviewCount)}
              </span>
            </div>
            <strong>¥{item.price.toLocaleString()}</strong>
          </div>
          <MarkdownBlock className="item-description" text={item.description} />
          <div className="detail-actions">
            <button onClick={like}>
              <IconLabel icon={Heart} label="いいね" value={item.likeCount} />
            </button>
            <button disabled={!user || item.status !== "active"} onClick={messageSeller}>
              <IconLabel icon={MessageCircle} label="DM" />
            </button>
            {user?.id === item.sellerId ? (
              <button disabled={item.status !== "active" || cancelling} onClick={() => void cancelListing()}>
                <IconLabel icon={CircleOff} label={cancelling ? "取消中" : "取消"} />
              </button>
            ) : (
              <>
                <button disabled={!user || item.status !== "active"} onClick={purchase}>
                  <IconLabel icon={WalletCards} label="通常購入" />
                </button>
                <button className="primary-button" style={{ background: '#d85b46', color: '#fff' }} disabled={!user || item.status !== "active"} onClick={() => setShowNegotiation(true)}>
                  <IconLabel icon={Sparkles} label="AI交渉購入" />
                </button>
              </>
            )}
          </div>
          <div className="status-chip">{statusLabel(item.status)}</div>
        </article>

        <article className="panel ai-panel">
          <div className="panel-heading">
            <ImagePlus size={20} />
            <h3>AI使用風景</h3>
          </div>
          <div className="scene-grid">
            <section className="scene-card">
              <p className="eyebrow">Original</p>
              <img className="scene-image" src={item.imageUrl || "/placeholder.svg"} alt="" />
            </section>
            <section className="scene-card">
              <p className="eyebrow">AI Scene</p>
              {scene ? <img className="scene-image" src={scene.imageUrl} alt="" /> : <div className="scene-placeholder">あなた専用の使用イメージを生成できます</div>}
            </section>
          </div>
          <button className="ai-button" disabled={!user || sceneLoading} onClick={() => void generateScene()}>
            <ImagePlus size={18} />
            {sceneLoading ? "生成中" : scene ? "AI画像を再生成" : "AI画像を生成"}
          </button>
          {sceneError && <p className="error">{sceneError}</p>}
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

      {showNegotiation && (
        <div className="negotiation-modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="negotiation-modal-content" style={{ background: '#fffdf9', borderRadius: '12px', border: '2px solid #eadfd3', padding: '24px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eadfd3', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} style={{ color: '#d85b46' }} />
                <h3 style={{ margin: 0, color: '#1f2933' }}>AI代理価格交渉（エージェント・フリマ）</h3>
              </div>
              <button className="ghost-button" onClick={() => { setShowNegotiation(false); setNegotiationResult(null); }} style={{ padding: '4px' }}>✕</button>
            </div>

            {!negotiationResult && !negotiating ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0, color: '#5c6b73', fontSize: '14px', lineHeight: '1.5' }}>
                  「希望予算」と「欲しい度」を設定して、あなたの代理AIエージェントに値下げ交渉を任せましょう。<br />
                  出品者側の代理AI（性格：<strong>{item.aiPersonality === "osaka" ? "コテコテの大阪商人" : item.aiPersonality === "cool" ? "冷静沈着エリート" : item.aiPersonality === "anime" ? "元気でかわいいアニメキャラ" : "標準・丁寧"}</strong>）と自律的にチャット交渉を行い、合意すれば自動で購入が確定します！
                </p>
                <div className="two-col" style={{ display: 'grid', gap: '16px', gridTemplateColumns: '1fr 1fr' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#1f2933' }}>希望購入価格（予算）</label>
                    <input value={buyerBudget} onChange={(e) => setBuyerBudget(Number(e.target.value))} type="number" style={{ width: '100%' }} />
                    <small style={{ color: '#7d8b99' }}>出品価格: ¥{item.price.toLocaleString()}</small>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#1f2933' }}>どうしても欲しい度</label>
                    <select value={desireLevel} onChange={(e) => setDesireLevel(e.target.value as any)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #eadfd3', background: '#ffffff', height: '46px' }}>
                      <option value="high">絶対欲しい！（予算の1.1倍まで出せる）</option>
                      <option value="medium">普通に欲しい（予算の1.05倍まで許容）</option>
                      <option value="low">安ければ欲しい（予算ぴったりまで）</option>
                    </select>
                  </div>
                </div>
                {negError && <p className="error" style={{ margin: 0 }}>{negError}</p>}
                <button className="primary-button" onClick={startNegotiation} style={{ background: '#d85b46', color: '#ffffff', width: '100%' }}>
                  <Bot size={18} /> 交渉エージェントを起動して交渉開始！
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: '#eef2f5', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '200px', maxHeight: '400px', overflowY: 'auto' }}>
                  {negotiating && dialogueIndex === 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '180px', flexDirection: 'column', gap: '8px' }}>
                      <div className="updating-spinner" style={{ fontSize: '24px' }}>🤖 ⚔️ 🤖</div>
                      <p style={{ margin: 0, color: '#5c6b73', fontSize: '14px' }}>AIエージェント同士が極秘価格交渉室で対話中...</p>
                    </div>
                  )}

                  {Array.from({ length: dialogueIndex }).map((_, i) => {
                    const msg = negotiationResult?.dialogue[i];
                    if (!msg) return null;
                    const isBuyer = msg.speaker === "buyer";
                    return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignSelf: isBuyer ? 'flex-start' : 'flex-end', alignItems: isBuyer ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
                        <small style={{ color: '#7d8b99', fontSize: '11px', marginBottom: '2px' }}>
                          {isBuyer ? "あなた(購入者)の代理AI" : `出品者の代理AI (${item.aiPersonality === "osaka" ? "大阪商人" : item.aiPersonality === "cool" ? "冷徹エリート" : item.aiPersonality === "anime" ? "元気なアニメキャラ" : "標準"})`}
                        </small>
                        <div style={{ background: isBuyer ? '#ffefe9' : '#e3f3ff', border: isBuyer ? '1px solid #ffccb8' : '1px solid #b3dcff', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: '#1f2933', position: 'relative' }}>
                          {msg.text}
                          <div style={{ fontSize: '11px', color: '#7d8b99', marginTop: '6px', textAlign: 'right', fontWeight: 600 }}>
                            {msg.action === "accept" ? "🎉 妥結・合意！" : msg.action === "reject" ? "❌ 決裂" : `提示価格: ¥${msg.price.toLocaleString()}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {negotiationResult && dialogueIndex >= negotiationResult.dialogue.length && (
                  <div style={{ background: negotiationResult.status === "completed" ? "#e1f8eb" : "#f9dfd8", border: negotiationResult.status === "completed" ? "1px solid #1b8a5a" : "1px solid #9d372c", borderRadius: '8px', padding: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <strong style={{ fontSize: '18px', color: negotiationResult.status === "completed" ? "#1b8a5a" : "#9d372c" }}>
                      {negotiationResult.status === "completed" ? "🎉 交渉成立・自動購入完了！" : "❌ 交渉決裂..."}
                    </strong>
                    <p style={{ margin: 0, fontSize: '14px', color: '#1f2933' }}>
                      {negotiationResult.status === "completed" ? (
                        <>合意価格: <strong style={{ fontSize: '20px' }}>¥{negotiationResult.agreedPrice.toLocaleString()}</strong> で自動決済されました！</>
                      ) : (
                        "お互いの希望価格の折り合いがつきませんでした。"
                      )}
                    </p>
                    <button className="ghost-button" onClick={() => { setShowNegotiation(false); setNegotiationResult(null); }} style={{ marginTop: '8px', background: '#ffffff', width: '100%' }}>閉じる</button>
                  </div>
                )}
              </div>
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
  onOpenItem
}: {
  user: User | null;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  messages: Message[];
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onSelect: (conversationId: number) => void;
  onOpenItem: (itemId: number) => void;
}) {
  const [body, setBody] = useState("購入前に状態をもう少し教えてください。");

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
              <img src={selectedConversation.itemImageUrl || "/placeholder.svg"} alt="" />
              <div className="conversation-item-copy">
                <div className="conversation-counterpart">
                  <img src={selectedConversation.counterpartAvatarUrl || "/placeholder-avatar.svg"} alt="" />
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

function ReviewComposer({
  api,
  itemId,
  counterpartName
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  itemId: number;
  counterpartName: string;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("スムーズで安心できる取引でした。");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api<{ review: UserReview }>(`/items/${itemId}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, comment })
      });
      setMessage("評価を投稿しました");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "評価の投稿に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="review-form" onSubmit={submit}>
      <div className="panel-heading">
        <Star size={18} />
        <h3>{counterpartName} さんを評価</h3>
      </div>
      <div className="rating-picker">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} className={value <= rating ? "star-button active" : "star-button"} type="button" onClick={() => setRating(value)}>
            <Star size={18} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="primary-button" disabled={saving || !comment.trim()} type="submit">
        <Star size={18} />
        {saving ? "投稿中" : "評価する"}
      </button>
      {message && <p className={message.includes("失敗") || message.includes("already") ? "error" : "notice inline-notice"}>{message}</p>}
    </form>
  );
}

interface PersonalStats {
  summary: {
    totalSales: number;
    totalRevenue: number;
    activeItems: number;
    totalLikes: number;
  };
  categoryDistribution: { category: string; itemCount: number; totalValue: number }[];
  dailyRevenue: { date: string; txCount: number; revenue: number }[];
}

function MyPageScreen({
  user,
  myItems,
  api,
  onSessionUpdated,
  onOpenSell,
  onOpenItem,
  onCancelled
}: {
  user: User | null;
  myItems: Item[];
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onSessionUpdated: (token: string, user: User) => void;
  onOpenSell: () => void;
  onOpenItem: (itemId: number) => void;
  onCancelled: (itemId: number) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [activeTab, setActiveTab] = useState<"listings" | "dashboard">("listings");
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");

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

  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow">My Page</p>
          <h2>マイページ</h2>
        </div>
        <button className="primary-button" onClick={onOpenSell}>
          <IconLabel icon={PackagePlus} label="新規" />
        </button>
      </div>

      <section className="panel mypage-panel">
        <div className="profile-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%" }}>
            <img className="profile-avatar" src={user?.avatarUrl || "/placeholder-avatar.svg"} alt="" />
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

          {user?.role === "admin" && (
            <button className="primary-button" style={{ background: "#d85b46", color: "#fff", display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "8px", marginTop: "12px", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", width: "100%", justifyContent: "center" }} onClick={() => navigate({ page: "admin", subpage: "stats" })}>
              <ShieldAlert size={16} /> 🛡️ システム管理者ダッシュボードを開く
            </button>
          )}
        </div>
        {profileError && <p className="error">{profileError}</p>}

        {/* Tab Controls */}
        <div style={{ display: "flex", borderBottom: "2px solid #eadfd3", gap: "16px", margin: "24px 0 16px 0" }}>
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
        </div>

        {activeTab === "listings" ? (
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
                  <img src={item.imageUrl || "/placeholder.svg"} alt="" />
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
        ) : (
          <div className="personal-dashboard">
            {statsLoading ? (
              <div className="loading-state">分析データを集計中...</div>
            ) : statsError ? (
              <p className="error">{statsError}</p>
            ) : !stats ? (
              <p className="muted">データがありません</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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
                        stats.categoryDistribution.map((item) => {
                          const maxCount = Math.max(...stats.categoryDistribution.map((c) => c.itemCount), 1);
                          const pct = Math.round((item.itemCount / maxCount) * 100);
                          return (
                            <div key={item.category} className="chart-bar-row">
                              <div className="chart-bar-label">
                                <span>{item.category}</span>
                                <small>{item.itemCount} 点 (¥{item.totalValue.toLocaleString()})</small>
                              </div>
                              <div className="chart-bar-bg">
                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: "#d85b46" }}></div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Sales trend */}
                  <div className="chart-container">
                    <h3>日別売上推移 (直近30日)</h3>
                    <div className="chart-list max-h-300">
                      {(!stats.dailyRevenue || stats.dailyRevenue.length === 0) ? (
                        <p className="empty-text">販売実績がまだありません</p>
                      ) : (
                        stats.dailyRevenue.map((item) => {
                          const maxRev = Math.max(...stats.dailyRevenue.map((d) => d.revenue), 1);
                          const pct = Math.round((item.revenue / maxRev) * 100);
                          return (
                            <div key={item.date} className="chart-bar-row">
                              <div className="chart-bar-label">
                                <span>{item.date} ({item.txCount} 件)</span>
                                <strong>¥ {item.revenue.toLocaleString()}</strong>
                              </div>
                              <div className="chart-bar-bg">
                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: "#47a8bd" }}></div>
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
      </section>
    </section>
  );
}

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "sell") return { page: "sell" };
  if (hash === "messages") return { page: "messages" };
  if (hash === "mypage") return { page: "mypage" };
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
        : route.page === "home"
          ? "home"
          : route.page;
  window.location.hash = hash;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function statusLabel(status: Item["status"] | Conversation["itemStatus"]) {
  if (status === "sold") return "売却済み";
  if (status === "hidden") return "公開停止";
  return "販売中";
}

function ratingLabel(avg: number, count: number) {
  if (!count) return "評価なし";
  return `★ ${avg.toFixed(1)} (${count}件)`;
}

function renderMarkdown(source: string) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
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

  const closeCodeBlock = () => {
    if (!inCodeBlock) return;
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    inCodeBlock = false;
    codeLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      closeList();
      if (inCodeBlock) {
        closeCodeBlock();
      } else {
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
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (bullet) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
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
  closeCodeBlock();

  return html.join("");
}

function renderInline(text: string) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadUser() {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

// ==========================================
// Admin Dashboard Components
// ==========================================

interface AdminStats {
  summary: {
    totalUsers: number;
    totalItems: number;
    totalTransactions: number;
    totalRevenue: number;
  };
  dailySignups: { date: string; count: number }[];
  dailyTransactions: { date: string; txCount: number; revenue: number }[];
  categoryDistribution: { category: string; itemCount: number; totalValue: number }[];
}

interface AdminModerationRecord {
  id: number;
  itemId: number;
  itemTitle: string;
  userId: number;
  userName: string;
  prohibited: boolean;
  riskLevel: string;
  reasons: string[];
  blockedKeywords: string[];
  createdAt: string;
}

interface AdminUserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  createdAt: string;
}

function AdminDashboardScreen({
  api,
  currentSubpage,
  onSubpageChange,
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  currentSubpage: "stats" | "moderations" | "users";
  onSubpageChange: (subpage: "stats" | "moderations" | "users") => void;
}) {
  return (
    <section className="screen admin-screen">
      <div className="admin-header">
        <h2 className="section-title">管理者ダッシュボード</h2>
        <div className="admin-subnav">
          <button
            className={`tab-link ${currentSubpage === "stats" ? "active" : ""}`}
            onClick={() => onSubpageChange("stats")}
          >
            <TrendingUp size={16} /> 分析・統計
          </button>
          <button
            className={`tab-link ${currentSubpage === "moderations" ? "active" : ""}`}
            onClick={() => onSubpageChange("moderations")}
          >
            <ShieldAlert size={16} /> AI出品審査履歴
          </button>
          <button
            className={`tab-link ${currentSubpage === "users" ? "active" : ""}`}
            onClick={() => onSubpageChange("users")}
          >
            <Users size={16} /> ユーザー管理
          </button>
        </div>
      </div>

      <div className="admin-content">
        {currentSubpage === "stats" && <AdminStatsView api={api} />}
        {currentSubpage === "moderations" && <AdminModerationView api={api} />}
        {currentSubpage === "users" && <AdminUsersView api={api} />}
      </div>
    </section>
  );
}

function AdminStatsView({
  api,
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    setLoading(true);
    api<AdminStats>("/admin/stats")
      .then((data) => {
        setStats(data);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "統計データの取得に失敗しました");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">読み込み中...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!stats) return null;

  const maxSignup = Math.max(...(stats.dailySignups || []).map((d) => d.count), 1);
  const maxRevenue = Math.max(...(stats.dailyTransactions || []).map((d) => d.revenue), 1);
  const maxItemCount = Math.max(...(stats.categoryDistribution || []).map((c) => c.itemCount), 1);

  return (
    <div className="admin-stats-view">
      {/* Summary Cards */}
      <div className="stats-cards-grid">
        <div className="stat-card">
          <h3>総ユーザー数</h3>
          <p className="stat-number">{(stats.summary?.totalUsers || 0).toLocaleString()} 名</p>
        </div>
        <div className="stat-card">
          <h3>総出品数</h3>
          <p className="stat-number">{(stats.summary?.totalItems || 0).toLocaleString()} 点</p>
        </div>
        <div className="stat-card">
          <h3>取引完了数</h3>
          <p className="stat-number">{(stats.summary?.totalTransactions || 0).toLocaleString()} 件</p>
        </div>
        <div className="stat-card">
          <h3>総売上高</h3>
          <p className="stat-number primary">¥ {(stats.summary?.totalRevenue || 0).toLocaleString()}</p>
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
              stats.categoryDistribution.map((item) => {
                const pct = Math.round((item.itemCount / maxItemCount) * 100);
                return (
                  <div key={item.category} className="chart-bar-row">
                    <div className="chart-bar-label">
                      <span>{item.category}</span>
                      <small>{item.itemCount} 点 (¥{(item.totalValue || 0).toLocaleString()})</small>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Daily Registrations */}
        <div className="chart-container">
          <h3>日別新規ユーザー登録数 (直近30日)</h3>
          <div className="chart-list max-h-300">
            {(!stats.dailySignups || stats.dailySignups.length === 0) ? (
              <p className="empty-text">データがありません</p>
            ) : (
              stats.dailySignups.map((item) => {
                const pct = Math.round((item.count / maxSignup) * 100);
                return (
                  <div key={item.date} className="chart-bar-row">
                    <div className="chart-bar-label">
                      <span>{item.date}</span>
                      <strong>{item.count} 名</strong>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill accent" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Daily Transactions */}
        <div className="chart-container full-width">
          <h3>日別取引売上高 (直近30日)</h3>
          <div className="chart-list max-h-300">
            {(!stats.dailyTransactions || stats.dailyTransactions.length === 0) ? (
              <p className="empty-text">データがありません</p>
            ) : (
              stats.dailyTransactions.map((item) => {
                const pct = Math.round((item.revenue / maxRevenue) * 100);
                return (
                  <div key={item.date} className="chart-bar-row">
                    <div className="chart-bar-label">
                      <span>{item.date} ({item.txCount} 件の取引)</span>
                      <strong>¥ {(item.revenue || 0).toLocaleString()}</strong>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill primary-fill" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminModerationView({
  api,
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moderations, setModerations] = useState<AdminModerationRecord[]>([]);

  useEffect(() => {
    setLoading(true);
    api<{ moderations: AdminModerationRecord[] }>("/admin/moderations")
      .then((data) => {
        setModerations(data.moderations || []);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "審査履歴の取得に失敗しました");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">読み込み中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="admin-moderation-view">
      <h3>AI出品審査・不適切コンテンツ検知ログ</h3>
      <p className="subtitle">OpenAIの画像・テキスト解析によって検知された不適切な出品の一覧です。</p>

      {moderations.length === 0 ? (
        <div className="empty-state">
          <p>出品審査ログはまだありません。</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>商品ID</th>
                <th>商品名</th>
                <th>出品者</th>
                <th>リスク判定</th>
                <th>出品禁止</th>
                <th>検出キーワード</th>
                <th>AI検知理由</th>
              </tr>
            </thead>
            <tbody>
              {moderations.map((m) => {
                const badgeColor =
                  m.riskLevel === "high"
                    ? "danger"
                    : m.riskLevel === "medium"
                    ? "warning"
                    : "success";
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap small-text text-nowrap">
                      {new Date(m.createdAt).toLocaleString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>#{m.itemId}</td>
                    <td>
                      <a href={`#item/${m.itemId}`} className="item-link">
                        {m.itemTitle}
                      </a>
                    </td>
                    <td className="small-text">{m.userName} (ID:{m.userId})</td>
                    <td>
                      <span className={`risk-badge ${badgeColor}`}>
                        {m.riskLevel.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {m.prohibited ? (
                        <span className="danger-text font-bold">禁止判定 (ブロック)</span>
                      ) : (
                        <span className="success-text">許可</span>
                      )}
                    </td>
                    <td className="small-text max-w-150">
                      {m.blockedKeywords.length > 0 ? (
                        <div className="tag-list">
                          {m.blockedKeywords.map((tag) => (
                            <span key={tag} className="keyword-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray">-</span>
                      )}
                    </td>
                    <td className="small-text reasons-cell">
                      <ul className="reasons-list">
                        {m.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminUsersView({
  api,
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadUsers = () => {
    setLoading(true);
    api<{ users: AdminUserRecord[] }>("/admin/users")
      .then((data) => {
        setUsers(data.users || []);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "ユーザー一覧の取得に失敗しました");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const changeRole = async (userId: number, newRole: string) => {
    setUpdatingId(userId);
    try {
      await api<any>(`/admin/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "ロールの変更に失敗しました");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <div className="loading-state">読み込み中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="admin-users-view">
      <h3>プラットフォームユーザー管理</h3>
      <p className="subtitle">
        登録ユーザーの一覧表示および権限（ロール）の変更を行うことができます。
      </p>

      <div className="table-responsive">
        <table className="admin-table">
          <thead>
            <tr>
              <th>アバター</th>
              <th>ユーザーID</th>
              <th>名前</th>
              <th>メールアドレス</th>
              <th>登録日</th>
              <th>ロール権限</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <img
                    src={u.avatarUrl || "./placeholder-avatar.svg"}
                    alt={u.name}
                    className="avatar-img"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "./placeholder-avatar.svg";
                    }}
                  />
                </td>
                <td>#{u.id}</td>
                <td><strong>{u.name}</strong></td>
                <td>{u.email}</td>
                <td className="small-text text-nowrap">
                  {new Date(u.createdAt).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                  })}
                </td>
                <td>
                  <select
                    value={u.role}
                    disabled={updatingId === u.id}
                    onChange={(e) => void changeRole(u.id, e.target.value)}
                    className="admin-role-select"
                  >
                    <option value="user">一般ユーザー (user)</option>
                    <option value="admin">管理者 (admin)</option>
                  </select>
                  {updatingId === u.id && <span className="updating-spinner">...</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
