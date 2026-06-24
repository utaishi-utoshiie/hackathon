/**
 * @file AuthScreen.tsx
 * @description Next Market - 認証画面（ログイン ＆ 会員登録 ＆ 開発者デモパスワードリライター）
 */

import React, { useState, FormEvent } from "react";
import { LogIn, Store, PackagePlus, MessageCircle } from "lucide-react";
import { User } from "./types";
import { signInWithPopup } from "firebase/auth";
import { firebaseAuth, firebaseConfigured, googleProvider } from "./firebase";

const API_BASE = "/api";

function IconLabel({
  icon: Icon,
  label,
  value,
  className
}: {
  icon: any;
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

interface AuthScreenProps {
  onSessionUpdated: (token: string, user: User) => void;
  notice: string;
}

export function AuthScreen({
  onSessionUpdated,
  notice
}: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
      const errMsg = err instanceof Error ? err.message : "";
      if (mode === "register" && (errMsg.includes("already registered") || errMsg.includes("409") || errMsg.includes("duplicate"))) {
        setMode("login");
        setError("このメールアドレスは既に登録されています。自動的にログインモードに切り替えました。パスワードを確認し、もう一度ボタンを押してログインしてください。");
      } else {
        setError(err instanceof Error ? err.message : "認証に失敗しました");
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      if (!firebaseConfigured) throw new Error("Firebase の環境変数が未設定です。frontend/.env.example を参照してください。");
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      const response = await fetch(`${API_BASE}/auth/firebase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await credential.user.getIdToken() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Google ログインに失敗しました");
      onSessionUpdated(data.token, data.user);
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
      if (code !== "auth/popup-closed-by-user") setError(err instanceof Error ? err.message : "Google ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-layout">
      <div className="auth-hero">
        <p className="eyebrow">Next Market</p>
        <h1>次世代のフリマサービスを体験しよう</h1>
        <p className="lede">AI交渉エージェントから、マルチホップ物々交換、Stripeエスクロー、AI自動写真補正まで完備した最先端フリマ</p>
        <div className="auth-points">
        </div>
      </div>

      <section className="auth-card panel">
        <div className="panel-heading">
          <LogIn size={20} />
          <h2>{mode === "register" ? "新規登録" : "ログイン"}</h2>
        </div>
        <div className="segmented">
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            新規登録
          </button>
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            ログイン
          </button>
        </div>

        <button className="google-auth-button" disabled={loading} type="button" onClick={signInWithGoogle}>
          <span className="google-logo" aria-hidden="true">G</span>
          Google アカウントで続ける
        </button>
        <div className="auth-divider"><span>または</span></div>

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

      </section>
    </section>
  );
}
