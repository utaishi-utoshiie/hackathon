import React, { useState, useEffect } from "react";
import { ShieldAlert, TrendingUp, Users, Bot } from "lucide-react";
import { User, Item, getPublicUrl } from "./types";

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
  sellerName: string;
  prohibited: boolean;
  riskLevel: "low" | "medium" | "high";
  reasons: string;
  blockedKeywords: string;
  createdAt: string;
}

export function AdminDashboardScreen({
  api,
  currentSubpage,
  onSubpageChange
}: {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  currentSubpage: "stats" | "moderations" | "users";
  onSubpageChange: (subpage: "stats" | "moderations" | "users") => void;
}) {
  return (
    <section className="page-shell">
      <div className="split-heading">
        <div>
          <p className="eyebrow" style={{ color: "#d85b46" }}>Admin Center</p>
          <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldAlert size={24} style={{ color: "#d85b46" }} /> プラットフォーム管理センター
          </h2>
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "2px solid #eadfd3", gap: "16px", margin: "24px 0" }}>
        <button
          onClick={() => onSubpageChange("stats")}
          style={{ background: "none", border: "none", padding: "10px 16px", fontWeight: 600, fontSize: "15px", color: currentSubpage === "stats" ? "#d85b46" : "#5c6b73", borderBottom: currentSubpage === "stats" ? "3px solid #d85b46" : "3px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
        >
          <TrendingUp size={16} /> 統計KPI
        </button>
        <button
          onClick={() => onSubpageChange("moderations")}
          style={{ background: "none", border: "none", padding: "10px 16px", fontWeight: 600, fontSize: "15px", color: currentSubpage === "moderations" ? "#d85b46" : "#5c6b73", borderBottom: currentSubpage === "moderations" ? "3px solid #d85b46" : "3px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
        >
          <Bot size={16} /> AI検知ログ
        </button>
        <button
          onClick={() => onSubpageChange("users")}
          style={{ background: "none", border: "none", padding: "10px 16px", fontWeight: 600, fontSize: "15px", color: currentSubpage === "users" ? "#d85b46" : "#5c6b73", borderBottom: currentSubpage === "users" ? "3px solid #d85b46" : "3px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
        >
          <Users size={16} /> ユーザー管理
        </button>
      </div>

      {currentSubpage === "stats" && <AdminStatsView api={api} />}
      {currentSubpage === "moderations" && <AdminModerationsView api={api} />}
      {currentSubpage === "users" && <AdminUsersView api={api} />}
    </section>
  );
}

function AdminStatsView({ api }: { api: <T>(path: string, options?: RequestInit) => Promise<T> }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api<AdminStats>("/admin/stats")
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "統計の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">読み込み中...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!stats) return <div className="muted">データがありません</div>;

  return (
    <div className="admin-stats-view">
      <div className="stats-cards-grid" style={{ marginBottom: "24px" }}>
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

        <div className="chart-container">
          <h3>最近の売上推移（直近30日）</h3>
          <div className="chart-list">
            {(!stats.dailyTransactions || stats.dailyTransactions.length === 0) ? (
              <p className="empty-text">データがありません</p>
            ) : (
              stats.dailyTransactions.map((t) => {
                const maxVal = Math.max(...stats.dailyTransactions.map((d) => d.revenue));
                const pct = maxVal > 0 ? (t.revenue / maxVal) * 100 : 0;
                return (
                  <div key={t.date} className="chart-item">
                    <span className="chart-label">{t.date} (¥{t.revenue.toLocaleString()})</span>
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
  );
}

function AdminModerationsView({ api }: { api: <T>(path: string, options?: RequestInit) => Promise<T> }) {
  const [moderations, setModerations] = useState<AdminModerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api<{ moderations: AdminModerationRecord[] }>("/admin/moderations")
      .then((data) => setModerations(data.moderations || []))
      .catch((err) => setError(err instanceof Error ? err.message : "モデレーションの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">読み込み中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="admin-moderations-view">
      <h3>AI不適切出品・ブロックキーワード検知ログ</h3>
      <p className="subtitle" style={{ color: "#64748b", fontSize: "14px", marginBottom: "16px" }}>
        安全なC2C市場環境を保護するため、OpenAIの画像＆テキスト多角解析でブロックされた危険な出品・ナイフや危険物の検知ログを表示します。
      </p>

      <div className="table-responsive">
        <table className="admin-table">
          <thead>
            <tr>
              <th>商品情報</th>
              <th>出品者</th>
              <th>リスク判定</th>
              <th>検知されたキーワード</th>
              <th>不適切判定の理由・詳細</th>
              <th>検知日時</th>
            </tr>
          </thead>
          <tbody>
            {moderations.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.itemTitle}</strong>
                  <br />
                  <small style={{ color: "#64748b" }}>ID: #{m.itemId}</small>
                </td>
                <td>{m.sellerName}</td>
                <td>
                  <span style={{ 
                    background: m.riskLevel === "high" ? "#fee2e2" : m.riskLevel === "medium" ? "#fef3c7" : "#ecfdf5",
                    color: m.riskLevel === "high" ? "#991b1b" : m.riskLevel === "medium" ? "#92400e" : "#065f46",
                    padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" 
                  }}>
                    {m.riskLevel.toUpperCase()}
                  </span>
                </td>
                <td style={{ color: "#b91c1c", fontWeight: 600 }}>{m.blockedKeywords || "なし"}</td>
                <td style={{ fontSize: "13px", color: "#475569" }}>{m.reasons}</td>
                <td style={{ fontSize: "12px", color: "#64748b" }}>{new Date(m.createdAt).toLocaleString("ja-JP")}</td>
              </tr>
            ))}
            {moderations.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>モデレーション検知ログはありません。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminUsersView({ api }: { api: <T>(path: string, options?: RequestInit) => Promise<T> }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api<{ users: User[] }>("/admin/users")
      .then((data) => setUsers(data.users || []))
      .catch((err) => setError(err instanceof Error ? err.message : "ユーザーの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const toggleRole = async (targetUser: User) => {
    const nextRole = targetUser.role === "admin" ? "user" : "admin";
    setUpdatingId(targetUser.id);
    try {
      await api(`/admin/users/${targetUser.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: nextRole })
      });
      setUsers(users.map((u) => (u.id === targetUser.id ? { ...u, role: nextRole } : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "ロールの変更に失敗しました");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <div className="loading-state">読み込み中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="admin-users-view" style={{ color: "#1f2937" }}>
      <h3>プラットフォームユーザー管理</h3>
      <p className="subtitle" style={{ color: "#64748b", fontSize: "14px", marginBottom: "16px" }}>
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
              <th>ロール権限</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <img
                    className="avatar-img"
                    src={getPublicUrl(u.avatarUrl) || "./placeholder-avatar.svg"}
                    alt={u.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "./placeholder-avatar.svg";
                    }}
                  />
                </td>
                <td>#{u.id}</td>
                <td><strong>{u.name}</strong></td>
                <td>{u.email}</td>
                <td>
                  <button 
                    disabled={updatingId === u.id} 
                    onClick={() => void toggleRole(u)}
                    style={{ 
                      background: u.role === "admin" ? "#fecaca" : "#e2e8f0",
                      color: u.role === "admin" ? "#991b1b" : "#475569",
                      border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "12px"
                    }}
                  >
                    {updatingId === u.id ? "更新中..." : u.role.toUpperCase()}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
