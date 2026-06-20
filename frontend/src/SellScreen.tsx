/**
 * @file SellScreen.tsx
 * @description Next Market - 新規商品出品フォーム（画像複数枚、AI査定＆要約、カテゴリータグ選択）
 */

import React, { useState, FormEvent } from "react";
import { Sparkles, UploadCloud } from "lucide-react";
import { Item, CATEGORIES } from "./types";
import { PhotoAppraiser, AppraiseResult } from "./PhotoAppraiser";
import { uploadImage } from "./uploadImage";

interface SellScreenProps {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onCreated: (item: Item) => Promise<void>;
}

export function SellScreen({
  api,
  onCreated
}: SellScreenProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [appraiserApplied, setAppraiserApplied] = useState(false);
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

  function handleAppraiseApply(result: AppraiseResult) {
    setTitle(result.title);
    if (CATEGORIES.includes(result.category)) {
      setCategory(result.category);
    }
    setPrice(result.price);
    setMinPrice(result.minPrice);
    const descLines = [
      result.searchSummary ? `【相場情報】${result.searchSummary}` : "",
      result.reason ? `【査定根拠】${result.reason}` : "",
    ].filter(Boolean);
    if (descLines.length > 0) {
      setDescription(descLines.join("\n\n"));
    }
    setAppraiserApplied(true);
    setSuggestedMsg(`📷 AI写真査定完了: 推奨価格 ¥${result.price.toLocaleString()} (${result.reason})`);
  }

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
        const uploaded = await uploadImage(api, file, "item");
        urls.push(uploaded.publicUrl);
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

      <form onSubmit={submit} className="panel form-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* AI写真査定 */}
        <div className="input-group">
          <label>写真で商品を自動識別（AI査定）</label>
          <PhotoAppraiser api={api} onApply={handleAppraiseApply} />
          {appraiserApplied && (
            <p className="notice" style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#059669" }}>
              ✓ AI査定結果をフォームに反映しました。内容を確認・修正してから出品してください。
            </p>
          )}
        </div>

        <div className="input-group">
          <label>商品名</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="ルイヴィトンの折りたたみ財布" />
          <button type="button" disabled={suggesting} onClick={suggestPriceAndDescribe} style={{ background: "linear-gradient(135deg, #4F46E5, #6366f1)", color: "#fff", border: "none", alignSelf: "start", marginTop: "8px", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
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
                  background: category === cat ? "#4F46E5" : "#f1f5f9",
                  color: category === cat ? "#ffffff" : "#1A1B2E",
                  border: "1px solid #edeef5",
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
            <small style={{ color: "#9698ab" }}>※AI交渉エージェントが、これ未満での値下げ交渉を完全にブロックします。</small>
          </div>
        </div>

        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div className="input-group">
            <label>交渉代理AIの性格</label>
            <select value={aiPersonality} onChange={(e: any) => setAiPersonality(e.target.value)}>
              <option value="standard">標準・丁寧（standard）</option>
              <option value="osaka">コテコテの大阪商人（osaka）</option>
              <option value="cool">冷静エリート（cool）</option>
              <option value="anime">元気でかわいいアニメキャラ（anime）</option>
            </select>
          </div>
          <div className="input-group">
            <label style={{ opacity: 0 }}>&nbsp;</label>
            <div style={{ display: "flex", alignItems: "center", height: "48px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", margin: 0 }}>
                <input 
                  type="checkbox" 
                  checked={barterEnabled} 
                  onChange={(e) => setBarterEnabled(e.target.checked)} 
                  style={{ width: "16px", height: "16px", margin: 0, cursor: "pointer" }}
                />
                <strong style={{ fontSize: "14px", color: "#1A1B2E" }}>🔄 わらしべ物々交換を許可する</strong>
              </label>
            </div>
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
                    color: wantCategory === cat ? "#ffffff" : "#1A1B2E",
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
