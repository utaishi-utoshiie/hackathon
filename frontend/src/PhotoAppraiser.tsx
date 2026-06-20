/**
 * @file PhotoAppraiser.tsx
 * @description カメラで撮影した商品画像をGemini Vision + Google Search grounding で分析し、
 * 商品名・カテゴリ・相場価格を自動提案するコンポーネント。
 */

import React, { useRef, useState } from "react";
import { Camera, Sparkles, CheckCircle, AlertCircle } from "lucide-react";
import { CATEGORIES } from "./types";

export interface AppraiseResult {
  title: string;
  brand: string;
  category: string;
  condition: string;
  price: number;
  minPrice: number;
  maxPrice: number;
  reason: string;
  searchSummary: string;
}

interface PhotoAppraiserProps {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onApply: (result: AppraiseResult) => void;
}

const CONDITIONS = [
  { value: "未使用・未開封", label: "未使用・未開封" },
  { value: "未使用に近い", label: "未使用に近い" },
  { value: "良い",         label: "良い（多少の使用感）" },
  { value: "普通",         label: "普通（使用感あり）" },
  { value: "傷・汚れあり",  label: "傷・汚れあり" },
];

export function PhotoAppraiser({ api, onApply }: PhotoAppraiserProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [condition, setCondition] = useState("良い");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AppraiseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("JPEG・PNG・WebP・GIF形式の画像を選択してください");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("画像は1枚10MB以下にしてください");
      return;
    }

    setImageFile(file);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function runAppraisal() {
    if (!imageFile || !preview) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // DataURL → base64（プレフィックスを除去）
      const base64 = preview.split(",")[1];
      const mimeType = imageFile.type || "image/jpeg";

      const res = await api<AppraiseResult>("/ai/photo-appraise", {
        method: "POST",
        body: JSON.stringify({ imageBase64: base64, mimeType, condition }),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI査定に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  const isValidCategory = result && CATEGORIES.includes(result.category);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Camera size={18} color="#4F46E5" />
        <span style={styles.headerTitle}>カメラAI査定</span>
        <span style={styles.badge}>Gemini + Google Search</span>
      </div>

      {/* 撮影・ファイル選択 */}
      <div style={styles.uploadArea} onClick={() => fileInputRef.current?.click()}>
        {preview ? (
          <img src={preview} alt="商品プレビュー" style={styles.previewImage} />
        ) : (
          <div style={styles.uploadPlaceholder}>
            <Camera size={32} color="#94a3b8" />
            <span style={styles.uploadText}>写真を撮影 / 選択</span>
            <span style={styles.uploadSubtext}>モバイルでは端末カメラが起動します</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>

      {/* 状態選択 */}
      {preview && (
        <>
          <div style={styles.conditionRow}>
            <label style={styles.conditionLabel}>商品の状態</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              style={styles.conditionSelect}
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={runAppraisal}
            style={styles.appraiseButton}
          >
            <Sparkles size={14} />
            {loading ? "Geminiが相場を調査中..." : "AI で商品識別・価格査定"}
          </button>
        </>
      )}

      {/* エラー */}
      {error && (
        <div style={styles.errorBox}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={styles.resultBox}>
          <div style={styles.resultHeader}>
            <CheckCircle size={16} color="#059669" />
            <span style={styles.resultTitle}>AI査定完了</span>
          </div>

          <div style={styles.resultGrid}>
            <ResultRow label="商品名" value={result.title} />
            {result.brand && <ResultRow label="ブランド" value={result.brand} />}
            <ResultRow label="カテゴリ" value={result.category} />
            <ResultRow
              label="推奨価格"
              value={`¥${result.price.toLocaleString()} （¥${result.minPrice.toLocaleString()} 〜 ¥${result.maxPrice.toLocaleString()}）`}
              highlight
            />
          </div>

          {result.searchSummary && (
            <div style={styles.summary}>
              <span style={styles.summaryLabel}>相場調査</span>
              <p style={styles.summaryText}>{result.searchSummary}</p>
            </div>
          )}

          {result.reason && (
            <p style={styles.reason}>{result.reason}</p>
          )}

          <button
            type="button"
            onClick={() => onApply(result)}
            style={styles.applyButton}
          >
            この情報を出品フォームに反映する
          </button>
          {!isValidCategory && (
            <p style={styles.categoryNote}>
              ※カテゴリー「{result.category}」は手動で再選択してください
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={styles.resultRow}>
      <span style={styles.resultRowLabel}>{label}</span>
      <span style={{ ...styles.resultRowValue, ...(highlight ? styles.highlighted : {}) }}>
        {value}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "#f7f8fc",
    border: "2px dashed #4F46E5",
    borderRadius: "16px",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: "14px",
    color: "#1A1B2E",
  },
  badge: {
    background: "#fef3c7",
    color: "#b45309",
    fontSize: "10px",
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: "30px",
    marginLeft: "auto",
  },
  uploadArea: {
    border: "1px solid #edeef5",
    borderRadius: "12px",
    background: "#fff",
    cursor: "pointer",
    overflow: "hidden",
    minHeight: "130px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadPlaceholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    padding: "24px",
  },
  uploadText: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#4F46E5",
  },
  uploadSubtext: {
    fontSize: "11px",
    color: "#94a3b8",
  },
  previewImage: {
    width: "100%",
    maxHeight: "240px",
    objectFit: "contain",
  },
  conditionRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  conditionLabel: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#374151",
    whiteSpace: "nowrap",
  },
  conditionSelect: {
    flex: 1,
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid #edeef5",
    fontSize: "13px",
    background: "#fff",
  },
  appraiseButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    background: "linear-gradient(135deg, #4F46E5, #6366f1)",
    color: "#fff",
    border: "none",
    padding: "10px 18px",
    borderRadius: "30px",
    fontWeight: 700,
    fontSize: "13px",
    cursor: "pointer",
    width: "100%",
    boxShadow: "0 4px 6px -1px rgba(79, 70, 229, 0.2)",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "12px",
    color: "#dc2626",
  },
  resultBox: {
    background: "#f2f8f5",
    border: "1px solid #a7f3d0",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  resultTitle: {
    fontWeight: 700,
    fontSize: "13px",
    color: "#4F46E5",
  },
  resultGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "8px",
    fontSize: "12px",
  },
  resultRowLabel: {
    color: "#6b7280",
    flexShrink: 0,
    width: "70px",
  },
  resultRowValue: {
    color: "#1A1B2E",
    fontWeight: 500,
    textAlign: "right",
  },
  highlighted: {
    color: "#4F46E5",
    fontWeight: 700,
    fontSize: "14px",
  },
  summary: {
    background: "#ecfdf5",
    borderRadius: "8px",
    padding: "8px 10px",
  },
  summaryLabel: {
    fontSize: "10px",
    fontWeight: 700,
    color: "#4F46E5",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    display: "block",
    marginBottom: "4px",
  },
  summaryText: {
    fontSize: "11px",
    color: "#374151",
    margin: 0,
    lineHeight: 1.5,
  },
  reason: {
    fontSize: "11px",
    color: "#6b7280",
    margin: 0,
  },
  applyButton: {
    background: "#4F46E5",
    color: "#fff",
    border: "none",
    padding: "10px 18px",
    borderRadius: "30px",
    fontWeight: 700,
    fontSize: "13px",
    cursor: "pointer",
    width: "100%",
  },
  categoryNote: {
    fontSize: "11px",
    color: "#d97706",
    margin: 0,
    textAlign: "center" as const,
  },
};
