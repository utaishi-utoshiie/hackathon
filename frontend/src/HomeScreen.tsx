/**
 * @file HomeScreen.tsx
 * @description Next Market - ホーム画面（検索・カテゴリー・いいね・出品商品一覧、およびデモ投入ボタン）
 */

import React from "react";
import { Sparkles, Search } from "lucide-react";
import { Item, CATEGORIES, getPublicUrl } from "./types";

interface HomeScreenProps {
  items: Item[];
  itemsLoading: boolean;
  itemsError: string;
  filters: { q: string; category: string; min_price: string; max_price: string };
  onFiltersChange: (filters: { q: string; category: string; min_price: string; max_price: string }) => void;
  onOpenItem: (itemId: number) => void;
  onRunDemo?: () => void;
}

export function HomeScreen({
  items,
  itemsLoading,
  itemsError,
  filters,
  onFiltersChange,
  onOpenItem,
  onRunDemo
}: HomeScreenProps) {
  return (
    <section className="home-shell">
      <div className="hero-card panel">
        <div className="hero-copy">
          <p className="eyebrow" style={{ color: "#4F46E5", margin: 0 }}>Next Market</p>
          <h2 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "#1A1B2E" }}>次世代AI交渉 ＆ わらしべ物々交換フリマ</h2>
          <p style={{ color: "#6b6d85", fontSize: "14px", margin: 0, lineHeight: "1.5" }}>
            エージェント交渉からマルチホップ物々交換、AI写真編集、Stripeエスクローまで完備した最先端フリマ
          </p>
          {onRunDemo && (
            <div className="hero-actions">
              <button 
                type="button"
                onClick={onRunDemo} 
                className="primary-button"
                style={{ 
                  background: "linear-gradient(135deg, #6366f1, #4F46E5)", 
                  color: "#ffffff", 
                  border: "none", 
                  padding: "12px 24px", 
                  borderRadius: "30px", 
                  fontWeight: 700, 
                  fontSize: "14px", 
                  cursor: "pointer", 
                  boxShadow: "0 4px 15px rgba(79, 70, 229, 0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <Sparkles size={16} /> ⚡ デモデータを自動投入（デモを実行）
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-field">
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
          style={{ background: "#ffffff", border: "1px solid #e4e5f0", borderRadius: "18px", padding: "10px 14px", color: "#1A1B2E" }}
        >
          <option value="">すべてのカテゴリー</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="最安 (円)"
          value={filters.min_price}
          onChange={(e) => onFiltersChange({ ...filters, min_price: e.target.value })}
          style={{ padding: "10px 14px", border: "1px solid #e4e5f0", borderRadius: "18px", background: "#ffffff" }}
        />
        <input
          type="number"
          placeholder="最高 (円)"
          value={filters.max_price}
          onChange={(e) => onFiltersChange({ ...filters, max_price: e.target.value })}
          style={{ padding: "10px 14px", border: "1px solid #e4e5f0", borderRadius: "18px", background: "#ffffff" }}
        />
      </div>

      {itemsLoading ? (
        <div className="loading-state">商品をロード中...</div>
      ) : itemsError ? (
        <p className="error">{itemsError}</p>
      ) : (
        <section className="card-grid">
          {items.map((item) => (
            <article key={item.id} className="catalog-card" onClick={() => onOpenItem(item.id)}>
              <img src={getPublicUrl(item.imageUrl) || "/placeholder.svg"} alt="" />
              <div>
                <strong>{item.title}</strong>
                <span>¥{item.price.toLocaleString()}</span>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#9698ab", marginTop: "4px" }}>
                  <span>{item.category}</span>
                  {item.barterEnabled && <span style={{ color: "#4F46E5", fontWeight: "bold" }}>🔄 物々交換OK</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6b6d85", borderTop: "1px solid #edeef5", paddingTop: "6px", marginTop: "6px" }}>
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
