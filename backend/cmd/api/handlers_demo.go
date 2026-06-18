package main

import (
	"net/http"
)

func (a *app) seedDemo(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	db := a.dbHandle()
	if db == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	tx, err := db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback()

	// 1. Ensure mock demo users exist in the database
	_, _ = tx.ExecContext(r.Context(), `
		INSERT IGNORE INTO users (id, name, email, password_hash, role) 
		VALUES (9992, 'ガジェット太郎', 'gadget@example.com', 'demo_hash_9992', 'user')`)

	_, _ = tx.ExecContext(r.Context(), `
		INSERT IGNORE INTO users (id, name, email, password_hash, role) 
		VALUES (9993, 'お洒落はなこ', 'fashion@example.com', 'demo_hash_9993', 'user')`)

	// Ensure taishi@example.com exists with password 'example' and role 'admin'
	hashedTaishi := a.hashPassword("example")
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO users (name, email, password_hash, role) 
		VALUES ('Taishi', 'taishi@example.com', ?, 'admin')
		ON DUPLICATE KEY UPDATE password_hash = ?, role = 'admin'`, 
		hashedTaishi, hashedTaishi)

	// 2. Clean up existing demo data (including dependent records first to satisfy Foreign Key constraints)
	demoItemIDs := "(9901, 9902, 9903, 9904)"

	// Delete child rows first (scene generations, barter loop members, negotiations, likes, and purchases)
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM item_scene_generations WHERE item_id IN "+demoItemIDs+" OR user_id = ? OR user_id = 9992 OR user_id = 9993", u.ID)
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM barter_loop_members WHERE item_id IN "+demoItemIDs+" OR user_id = ? OR user_id = 9992 OR user_id = 9993", u.ID)
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM barter_loops WHERE id = 999")
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM negotiations WHERE item_id IN "+demoItemIDs+" OR buyer_id = ? OR buyer_id = 9992 OR buyer_id = 9993", u.ID)
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM likes WHERE item_id IN "+demoItemIDs+" OR user_id = ? OR user_id = 9992 OR user_id = 9993", u.ID)
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM purchases WHERE item_id IN "+demoItemIDs+" OR buyer_id = ? OR buyer_id = 9992 OR buyer_id = 9993", u.ID)
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM item_moderations WHERE item_id IN "+demoItemIDs)

	// Delete conversations and messages linked to demo items
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE item_id IN "+demoItemIDs+")")
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM conversations WHERE item_id IN "+demoItemIDs)
	
	// Delete item images of demo items
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM item_images WHERE item_id IN "+demoItemIDs)

	// Finally, delete demo items themselves! No foreign key constraint violations can occur now.
	_, _ = tx.ExecContext(r.Context(), "DELETE FROM items WHERE id IN "+demoItemIDs+" OR seller_id = ? OR seller_id = 9992 OR seller_id = 9993", u.ID)

	// 3. Insert Item A: iPhone 14 Pro (AI Negotiation candidate, Osaka merchant, owned by Gadget Taro)
	resA, err := tx.ExecContext(r.Context(), `
		INSERT INTO items (id, seller_id, title, description, category, price, min_price, ai_personality, status) 
		VALUES (9901, 9992, '「新品同様」iPhone 14 Pro 128GB スペースブラック', 'Stripe安全決済および大阪商人交渉AIデモ用のiPhone 14 Proです。バッテリー容量98%、傷なしの超美品。ケースとフィルムをつけて大切に使用していました。大阪商人AIが極秘価格の限界まで駆け引きしますやん！', '家電・スマホ', 88000, 78000, 'osaka', 'active')`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed demo item A: "+err.Error())
		return
	}
	itemAID, _ := resA.LastInsertId()
	_, _ = tx.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=600&q=80', 0)", itemAID)

	// 4. Insert Item B: Nintendo Switch (User's item for Barter Loop)
	resB, err := tx.ExecContext(r.Context(), `
		INSERT INTO items (id, seller_id, title, description, category, price, barter_enabled, want_category, status) 
		VALUES (9902, ?, 'Nintendo Switch 有機ELモデル（ホワイト）', 'わらしべ物々交換デモ用のゲーム機です。ほとんどプレイしていない極美品です。付属品・箱すべて揃っています。「家電・スマホ（特にiPad）」との物々交換を希望しています！', '本・ゲーム・エンタメ', 28000, 1, '家電・スマホ', 'active')`, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed demo item B: "+err.Error())
		return
	}
	itemBID, _ := resB.LastInsertId()
	_, _ = tx.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, 'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?auto=format&fit=crop&w=600&q=80', 0)", itemBID)

	// 5. Insert Item C: iPad Air 5 (Taro's item for Barter Loop, wants Fashion)
	resC, err := tx.ExecContext(r.Context(), `
		INSERT INTO items (id, seller_id, title, description, category, price, barter_enabled, want_category, status) 
		VALUES (9903, 9992, 'iPad Air 第5世代 Wi-Fi 64GB ブルー', '物々交換デモ用のiPad Airです。M1チップ搭載。イラスト作成用に購入しましたが、使用頻度が低いため出品します。「衣服・ファッション」系のアイテムと交換したいです。', '家電・スマホ', 65000, 1, '衣服・ファッション', 'active')`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed demo item C: "+err.Error())
		return
	}
	itemCID, _ := resC.LastInsertId()
	_, _ = tx.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=80', 0)", itemCID)

	// 6. Insert Item D: Burberry Trench Coat (Hanako's item for Barter Loop, wants Book/Games)
	resD, err := tx.ExecContext(r.Context(), `
		INSERT INTO items (id, seller_id, title, description, category, price, barter_enabled, want_category, status) 
		VALUES (9904, 9993, 'Burberry ケンジントン ロングトレンチコート', '物々交換デモ用のトレンチコートです。定番 of 定番のハニーカラー、サイズ38。数回着用のクリーニング済み美品。「本・ゲーム・エンタメ（特にSwitch）」との等価交換を希望しています！', '衣服・ファッション', 42000, 1, '本・ゲーム・エンタメ', 'active')`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed demo item D: "+err.Error())
		return
	}
	itemDID, _ := resD.LastInsertId()
	_, _ = tx.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=600&q=80', 0)", itemDID)

	// 7. Establish the Barter Loop #999 (Current User -> User 2 -> User 3 -> Current User)
	justification := "AさんのSwitch（ゲーム ¥28,000）、Bさん（ガジェット太郎）のiPad（家電 ¥65,000）、Cさん（お洒落はなこ）のコート（ファッション ¥42,000）による循環等価物々交換ループです。商品の参考市場価格の差額を完全に相殺し、全員の純利益が「ちょうど0円（ゼロサム）」に収束するように、Aさんは清算調整金として +¥14,000 を受け取り、Bさんは -¥37,000 を支払い、Cさんは +¥23,000 を受け取ります。決済および物流の整合性が完全に維持されます。"
	_, err = tx.ExecContext(r.Context(), `
		INSERT INTO barter_loops (id, status, justification) 
		VALUES (999, 'pending', ?)`, justification)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to establish barter loop: "+err.Error())
		return
	}

	// Insert Loop Members
	// Member 1 (Current User, sells Switch to Gadget Taro, wants iPad)
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO barter_loop_members (loop_id, user_id, item_id, receiver_id, cash_adjustment, shipping_status) 
		VALUES (999, ?, ?, 9992, 14000, 'pending')`, u.ID, itemBID)

	// Member 2 (Gadget Taro 9992, sells iPad to Fashion Hanako, wants Coat - pre-accepted)
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO barter_loop_members (loop_id, user_id, item_id, receiver_id, cash_adjustment, shipping_status) 
		VALUES (999, 9992, ?, 9993, -37000, 'accepted')`, itemCID)

	// Member 3 (Fashion Hanako 9993, sells Coat to Current User, wants Switch - pre-accepted)
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO barter_loop_members (loop_id, user_id, item_id, receiver_id, cash_adjustment, shipping_status) 
		VALUES (999, 9993, ?, ?, 23000, 'accepted')`, itemDID, u.ID)

	// Automatically create a pre-configured conversation/DM thread between Current User and Gadget Taro for immediate feedback
	_, _ = tx.ExecContext(r.Context(), `
		INSERT IGNORE INTO conversations (id, item_id, buyer_id, seller_id) 
		VALUES (999, 9901, ?, 9992)`, u.ID)

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit demo seed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status": "success",
		"message": "デモデータの自動セットアップ（清算差額調整、3者間Pendingループ、iPhone Active）が完了しました！",
		"negotiateItemId": 9901,
	})
}
