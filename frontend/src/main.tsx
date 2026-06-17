import { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  ChevronRight,
  Heart,
  Home,
  LogIn,
  MessageCircle,
  PackagePlus,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  UserCircle2,
  WalletCards
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type Item = {
  id: number;
  sellerId: number;
  sellerName: string;
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
  buyerId: number;
  sellerId: number;
  updatedAt: string;
};

type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
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

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  const [user, setUser] = useState<User | null>(loadUser());
  const [route, setRoute] = useState<Route>(() => normalizeRoute(readRoute(), Boolean(localStorage.getItem("token"))));
  const [items, setItems] = useState<Item[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    if (!token) {
      setConversations([]);
      setMessages([]);
      setSelectedConversationId(null);
      return;
    }
    void loadConversations();
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
  const myItems = user ? items.filter((item) => item.sellerId === user.id) : [];
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

  async function loadItems() {
    const data = await api<{ items: Item[] }>("/items");
    setItems(data.items);
  }

  async function loadConversations() {
    const data = await api<{ conversations: Conversation[] }>("/conversations");
    setConversations(data.conversations);
    if (data.conversations.length > 0) {
      setSelectedConversationId((current) => current ?? data.conversations[0].id);
    }
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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setNotice("ログアウトしました");
    navigate({ page: "auth" });
  }

  async function refreshItemsAndKeepSelection(itemId?: number) {
    await loadItems();
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
              <h1>売る、見つける、つながる。</h1>
              <p className="lede">メルカリのように役割ごとにページを分け、ホームから出品やDMへ自然に移れる構成に再設計しました。</p>
            </div>
            <div className="session-card">
              <div>
                <strong>{user?.name}</strong>
                <p>{user?.email}</p>
              </div>
              <button className="ghost-button" onClick={logout}>
                ログアウト
              </button>
            </div>
          </header>

          <Navigation route={route} />

          {notice && <p className="notice">{notice}</p>}

          {route.page === "home" && (
            <HomeScreen
              items={items}
              activeCount={activeCount}
              soldCount={soldCount}
              likedTotal={likedTotal}
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
            />
          )}

          {route.page === "mypage" && (
            <MyPageScreen
              user={user}
              myItems={myItems}
              onOpenSell={() => navigate({ page: "sell" })}
              onOpenItem={(itemId) => navigate({ page: "item", itemId })}
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
        <p>
          認証を最初に分離し、その後はホームを中心に「探す」「出品する」「やり取りする」をページ単位で遷移できるようにしました。
        </p>
        <div className="auth-points">
          <article>
            <Store size={18} />
            <div>
              <strong>ホームは一覧中心</strong>
              <p>商品サムネイルと導線を集約し、まず何ができるかが分かる構成です。</p>
            </div>
          </article>
          <article>
            <PackagePlus size={18} />
            <div>
              <strong>出品は独立画面</strong>
              <p>説明文生成や入力を一箇所にまとめ、迷わず出品に集中できます。</p>
            </div>
          </article>
          <article>
            <MessageCircle size={18} />
            <div>
              <strong>DMも別画面</strong>
              <p>会話一覧とメッセージを切り離し、詳細画面のノイズを減らしています。</p>
            </div>
          </article>
        </div>
      </div>

      <section className="auth-card panel">
        <div className="panel-heading">
          <LogIn size={20} />
          <h2>{mode === "register" ? "新規登録" : "ログイン"}</h2>
        </div>
        <p className="muted">認証後にホームへ遷移します。</p>
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
            <Icon size={18} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function HomeScreen({
  items,
  activeCount,
  soldCount,
  likedTotal,
  onOpenItem,
  onOpenSell,
  onOpenMessages
}: {
  items: Item[];
  activeCount: number;
  soldCount: number;
  likedTotal: number;
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
          <h2>まずはホームで流れをつかむ</h2>
          <p>商品一覧を主役にしつつ、出品・DM・売上確認への入口をまとめたメイン画面です。</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenSell}>
              <PackagePlus size={18} />
              出品する
            </button>
            <button className="ghost-button" onClick={onOpenMessages}>
              <MessageCircle size={18} />
              DMを見る
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
            </div>
          </button>
        )}
      </div>

      <div className="stats-grid">
        <article className="stat-card panel">
          <span>出品中</span>
          <strong>{activeCount}</strong>
        </article>
        <article className="stat-card panel">
          <span>売却済み</span>
          <strong>{soldCount}</strong>
        </article>
        <article className="stat-card panel">
          <span>総いいね</span>
          <strong>{likedTotal}</strong>
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
          <div className="card-grid">
            {latestItems.map((item) => (
              <button key={item.id} className="catalog-card" onClick={() => onOpenItem(item.id)}>
                <img src={item.imageUrl || "/placeholder.svg"} alt="" />
                <div>
                  <strong>{item.title}</strong>
                  <span>¥{item.price.toLocaleString()}</span>
                  <small>
                    {item.category} / {item.status}
                  </small>
                </div>
              </button>
            ))}
            {latestItems.length === 0 && <p className="muted">まだ商品がありません。</p>}
          </div>
        </section>

        <aside className="panel shortcut-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Shortcut</p>
              <h3>次にやること</h3>
            </div>
          </div>
          <button className="shortcut-row" onClick={onOpenSell}>
            <span>
              <strong>商品を出品する</strong>
              <small>AIで説明文を作って公開</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button className="shortcut-row" onClick={onOpenMessages}>
            <span>
              <strong>DMを確認する</strong>
              <small>購入前の相談や値段交渉へ</small>
            </span>
            <ChevronRight size={18} />
          </button>
          {leadItem && (
            <button className="shortcut-row" onClick={() => onOpenItem(leadItem.id)}>
              <span>
                <strong>おすすめ商品を見る</strong>
                <small>{leadItem.title} の詳細へ</small>
              </span>
              <ChevronRight size={18} />
            </button>
          )}
        </aside>
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
  const [aiError, setAIError] = useState("");

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
        setAIError("Gemini から空の説明文が返されました");
      }
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "説明文の生成に失敗しました");
    } finally {
      setLoadingAI(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const data = await api<{ item: Item }>("/items", {
      method: "POST",
      body: JSON.stringify({ title, category, description, price, imageUrl })
    });
    onCreated(data.item);
  }

  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow">Sell</p>
          <h2>出品ページ</h2>
          <p className="muted">ホームから移動して、出品作業だけに集中できる画面です。</p>
        </div>
        <button className="ghost-button" onClick={() => navigate({ page: "home" })}>
          <Home size={18} />
          ホームへ戻る
        </button>
      </div>

      <section className="panel form-panel">
        <div className="panel-heading">
          <PackagePlus size={20} />
          <h3>商品情報を入力</h3>
        </div>
        <form onSubmit={submit}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="商品名" />
          <div className="two-col">
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="カテゴリ" />
            <input value={price} onChange={(e) => setPrice(Number(e.target.value))} type="number" placeholder="価格" />
          </div>
          <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="状態" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="AIに渡すメモ" />
          <button className="ai-button" disabled={loadingAI} type="button" onClick={generateDescription}>
            <Sparkles size={18} />
            {loadingAI ? "生成中" : "Geminiで説明生成"}
          </button>
          {aiError && <p className="error">{aiError}</p>}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="商品説明" />
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="画像URL" />
          <button className="primary-button" disabled={!description} type="submit">
            <ShoppingBag size={18} />
            出品する
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
        setAIError("Gemini から回答が返されませんでした");
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

  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow">Item Detail</p>
          <h2>{item.title}</h2>
          <p className="muted">{item.sellerName} さんの出品</p>
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
            </div>
            <strong>¥{item.price.toLocaleString()}</strong>
          </div>
          <p className="item-description">{item.description}</p>
          <div className="detail-actions">
            <button onClick={like}>
              <Heart size={18} />
              {item.likeCount}
            </button>
            <button disabled={!user || item.status !== "active"} onClick={messageSeller}>
              <MessageCircle size={18} />
              DMする
            </button>
            <button disabled={!user || item.status !== "active"} onClick={purchase}>
              <WalletCards size={18} />
              購入する
            </button>
          </div>
          <div className="status-chip">{item.status === "active" ? "販売中" : "売却済み"}</div>
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
            {answer && <p className="ai-answer">{answer}</p>}
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
  onSelect
}: {
  user: User | null;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  messages: Message[];
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onSelect: (conversationId: number) => void;
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
          <h2>DMページ</h2>
          <p className="muted">詳細ページから作成した会話を、ここでまとめて管理します。</p>
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
                <strong>{conversation.itemTitle}</strong>
                <small>更新: {formatDate(conversation.updatedAt)}</small>
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
        </article>
      </section>
    </section>
  );
}

function MyPageScreen({
  user,
  myItems,
  onOpenSell,
  onOpenItem
}: {
  user: User | null;
  myItems: Item[];
  onOpenSell: () => void;
  onOpenItem: (itemId: number) => void;
}) {
  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow">My Page</p>
          <h2>{user?.name} さんのマイページ</h2>
          <p className="muted">自分の出品状況を確認し、必要ならそのまま新規出品へ移れます。</p>
        </div>
        <button className="primary-button" onClick={onOpenSell}>
          <PackagePlus size={18} />
          新しく出品
        </button>
      </div>

      <section className="panel mypage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">My Listings</p>
            <h3>あなたの出品</h3>
          </div>
        </div>
        <div className="card-grid compact-grid">
          {myItems.map((item) => (
            <button key={item.id} className="catalog-card compact" onClick={() => onOpenItem(item.id)}>
              <img src={item.imageUrl || "/placeholder.svg"} alt="" />
              <div>
                <strong>{item.title}</strong>
                <span>¥{item.price.toLocaleString()}</span>
                <small>{item.status}</small>
              </div>
            </button>
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
