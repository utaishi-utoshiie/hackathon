import { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  CircleOff,
  ChevronRight,
  Heart,
  Home,
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
  UploadCloud,
  UserCircle2,
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
  status: "active" | "sold" | "hidden";
  imageUrl: string;
  likeCount: number;
  createdAt: string;
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
  | { page: "item"; itemId: number };

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

          <Navigation route={route} />

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

function Navigation({ route }: { route: Route }) {
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
        body: JSON.stringify({ title, category, description, price, imageUrl })
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
          <div className="two-col">
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="カテゴリ" />
            <input value={price} onChange={(e) => setPrice(Number(e.target.value))} type="number" placeholder="価格" />
          </div>
          <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="状態" />
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
              <button disabled={!user || item.status !== "active"} onClick={purchase}>
                <IconLabel icon={WalletCards} label="購入" />
              </button>
            )}
          </div>
          <div className="status-chip">{statusLabel(item.status)}</div>
        </article>

        <article className="panel ai-panel">
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

  async function uploadAvatar(file: File | null) {
    if (!file || !user) return;
    setUploading(true);
    setProfileError("");
    try {
      const signed = await api<{ uploadUrl: string; publicUrl: string; contentType: string }>("/upload", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, contentType: file.type, purpose: "avatar" })
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
        body: JSON.stringify({ avatarUrl: signed.publicUrl, name: user.name })
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
        <div className="profile-panel">
          <img className="profile-avatar" src={user?.avatarUrl || "/placeholder-avatar.svg"} alt="" />
          <div className="profile-copy">
            <strong>{user?.name ?? "ユーザー"}</strong>
            <small>{user?.email ?? ""}</small>
          </div>
          <label className="upload-drop compact-upload">
            <UploadCloud size={18} />
            <span>{uploading ? "更新中" : "写真を変更"}</span>
            <input accept="image/*" disabled={uploading} type="file" onChange={(e) => void uploadAvatar(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        {profileError && <p className="error">{profileError}</p>}
        <div className="section-head">
          <div>
            <p className="eyebrow">My Listings</p>
            <h3>あなたの出品</h3>
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

createRoot(document.getElementById("root")!).render(<App />);
