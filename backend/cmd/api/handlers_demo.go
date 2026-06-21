// Package api implements the REST API handlers for Next Market.
package main

import (
	"net/http"
)

// seedDemo is an idempotent database seeder endpoint (POST /api/demo/seed).
// It resets the database and seeds high-fidelity mock data to support
// immediate, flawless demonstration of AI price negotiation and the 3-party Barter Loop.
func (a *app) seedDemo(w http.ResponseWriter, r *http.Request) {
	var currentUserRecord user
	if u := currentUser(r); u.ID != 0 {
		currentUserRecord = u
	} else {
		// Public visitors get auto-created/logged into the default "Aさん" (ID 9991) demo account!
		currentUserRecord = user{
			ID:        9991,
			Name:      "Aさん",
			Email:     "a@example.com",
			Role:      "user",
			AvatarURL: "",
		}
	}

	databaseConnection := a.dbHandle()
	if databaseConnection == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	// Begin an isolated transaction block to ensure atomic database execution
	databaseTransaction, err := databaseConnection.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer databaseTransaction.Rollback()

	// -------------------------------------------------------------------------
	// [Step 1]: Ensure Mock Demo Accounts exist in the system
	// -------------------------------------------------------------------------

	// Create "Aさん" (User 9991) - Default Demo Account for public visitors
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT IGNORE INTO users (id, name, email, password_hash, role) 
		VALUES (9991, 'Aさん', 'a@example.com', 'demo_hash_9991', 'user')`)

	// Create "Gadget Taro" (User 9992) - Owner of Item A and Item C
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT IGNORE INTO users (id, name, email, password_hash, role) 
		VALUES (9992, 'ガジェット太郎', 'gadget@example.com', 'demo_hash_9992', 'user')`)

	// Create "Fashion Hanako" (User 9993) - Owner of Item D
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT IGNORE INTO users (id, name, email, password_hash, role) 
		VALUES (9993, 'お洒落はなこ', 'fashion@example.com', 'demo_hash_9993', 'user')`)

	// Create/Update the Admin Account "taishi@example.com" with password "example"
	hashedAdminPassword := a.hashPassword("example")
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO users (name, email, password_hash, role) 
		VALUES ('Taishi', 'taishi@example.com', ?, 'admin')
		ON DUPLICATE KEY UPDATE password_hash = ?, role = 'admin'`,
		hashedAdminPassword, hashedAdminPassword)

	// -------------------------------------------------------------------------
	// [Step 2]: Safe Relational Database Cleanups
	// -------------------------------------------------------------------------

	demoItemIDs := "(9901, 9902, 9903, 9904)"

	// Temporarily disable foreign key checks during deletion to prevent relational constraint blockages
	_, _ = databaseTransaction.ExecContext(r.Context(), "SET FOREIGN_KEY_CHECKS = 0")

	// Cascade delete all dependent child rows pointing to demo items
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM item_scene_generations WHERE item_id IN "+demoItemIDs+" OR user_id = ? OR user_id = 9992 OR user_id = 9993", currentUserRecord.ID)
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM ai_generations WHERE item_id IN "+demoItemIDs+" OR user_id = ? OR user_id = 9992 OR user_id = 9993", currentUserRecord.ID)
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM user_reviews WHERE item_id IN "+demoItemIDs)
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM barter_loop_members WHERE item_id IN "+demoItemIDs+" OR user_id = ? OR user_id = 9992 OR user_id = 9993", currentUserRecord.ID)
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM barter_loops WHERE id = 999")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM negotiations WHERE item_id IN "+demoItemIDs+" OR buyer_id = ? OR buyer_id = 9992 OR buyer_id = 9993", currentUserRecord.ID)
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM likes WHERE item_id IN "+demoItemIDs+" OR user_id = ? OR user_id = 9992 OR user_id = 9993", currentUserRecord.ID)
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM purchases WHERE item_id IN "+demoItemIDs+" OR buyer_id = ? OR buyer_id = 9992 OR buyer_id = 9993", currentUserRecord.ID)
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM item_moderations WHERE item_id IN "+demoItemIDs)

	// Delete chat conversations and text messages associated with demo items
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE item_id IN "+demoItemIDs+")")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM conversations WHERE item_id IN "+demoItemIDs)

	// Delete image asset records
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM item_images WHERE item_id IN "+demoItemIDs)
	// Delete the 100-item marketplace catalog. The fixed ID range keeps this seeder idempotent.
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM item_scene_generations WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM ai_generations WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM user_reviews WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM barter_loop_members WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM negotiations WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM likes WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM purchases WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM item_moderations WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE item_id BETWEEN 10001 AND 10100)")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM conversations WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM item_images WHERE item_id BETWEEN 10001 AND 10100")
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM items WHERE id BETWEEN 10001 AND 10100")

	// Finally delete the parent items themselves safely
	_, _ = databaseTransaction.ExecContext(r.Context(), "DELETE FROM items WHERE id IN "+demoItemIDs+" OR seller_id = ? OR seller_id = 9992 OR seller_id = 9993", currentUserRecord.ID)

	// Restore foreign key constraint checks
	_, _ = databaseTransaction.ExecContext(r.Context(), "SET FOREIGN_KEY_CHECKS = 1")

	// -------------------------------------------------------------------------
	// [Step 3]: Seed Demo Parent Items
	// -------------------------------------------------------------------------

	// Item A: iPhone 14 Pro (AI Price Negotiation Candidate)
	resA, err := databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO items (id, seller_id, title, description, category, price, min_price, ai_personality, status) 
		VALUES (9901, 9992, '「新品同様」iPhone 14 Pro 128GB スペースブラック', 'Stripe安全決済および大阪商人交渉AIデモ用のiPhone 14 Proです。バッテリー容量98%、傷なしの超美品。ケースとフィルムをつけて大切に使用していました。大阪商人AIが極秘価格の限界まで駆け引きしますやん！', '家電・スマホ', 88000, 78000, 'osaka', 'active')`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed demo item A: "+err.Error())
		return
	}
	itemAID, _ := resA.LastInsertId()
	_, _ = databaseTransaction.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=600&q=80', 0)", itemAID)

	// Item B: Nintendo Switch (User's owned item for Barter Loop)
	resB, err := databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO items (id, seller_id, title, description, category, price, barter_enabled, want_category, status) 
		VALUES (9902, ?, 'Nintendo Switch 有機ELモデル（ホワイト）', 'わらしべ物々交換デモ用のゲーム機です。ほとんどプレイしていない極美品です。付属品・箱すべて揃っています。「家電・スマホ（特にiPad）」との物々交換を希望しています！', '本・ゲーム・エンタメ', 28000, 1, '家電・スマホ', 'active')`, currentUserRecord.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed demo item B: "+err.Error())
		return
	}
	itemBID, _ := resB.LastInsertId()
	_, _ = databaseTransaction.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, 'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?auto=format&fit=crop&w=600&q=80', 0)", itemBID)

	// Item C: iPad Air 5 (Taro's item for Barter Loop, wants Fashion)
	resC, err := databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO items (id, seller_id, title, description, category, price, barter_enabled, want_category, status) 
		VALUES (9903, 9992, 'iPad Air 第5世代 Wi-Fi 64GB ブルー', '物々交換デモ用のiPad Airです。M1チップ搭載。イラスト作成用に購入しましたが、使用頻度が低いため出品します。「衣服・ファッション」系のアイテムと交換したいです。', '家電・スマホ', 65000, 1, '衣服・ファッション', 'active')`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed demo item C: "+err.Error())
		return
	}
	itemCID, _ := resC.LastInsertId()
	_, _ = databaseTransaction.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=80', 0)", itemCID)

	// Item D: Burberry Coat (Hanako's item for Barter Loop, wants Books/Games)
	resD, err := databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO items (id, seller_id, title, description, category, price, barter_enabled, want_category, status) 
		VALUES (9904, 9993, 'Burberry ケンジントン ロングトレンチコート', '物々交換デモ用のトレンチコートです。定番 of 定番のハニーカラー、サイズ38。数回着用のクリーニング済み美品。「本・ゲーム・エンタメ（特にSwitch）」との等価交換を希望しています！', '衣服・ファッション', 42000, 1, '本・ゲーム・エンタメ', 'active')`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed demo item D: "+err.Error())
		return
	}
	itemDID, _ := resD.LastInsertId()
	_, _ = databaseTransaction.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=600&q=80', 0)", itemDID)

	// Add a substantial existing-item catalog so search, filters and home discovery
	// feel populated immediately after demo setup.
	if err := seedDemoCatalog(r.Context(), databaseTransaction); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed marketplace catalog: "+err.Error())
		return
	}

	// -------------------------------------------------------------------------
	// [Step 4]: Establish the 3-Party Barter Loop #999 (Current User -> User 2 -> User 3 -> Current User)
	// -------------------------------------------------------------------------

	justification := "AさんのSwitch（ゲーム ¥28,000）、Bさん（ガジェット太郎）のiPad（家電 ¥65,000）、Cさん（お洒落はなこ）のコート（ファッション ¥42,000）による循環等価物々交換ループです。商品の参考市場価格の差額を完全に相殺し、全員の純利益が「ちょうど0円（ゼロサム）」に収束するように、Aさんは価値の高いコートを受け取るため差額の -¥14,000 を支払い、Bさんは価値の低いSwitchを受け取るため差額の +¥37,000 を受け取り、Cさんは価値の高いiPadを受け取るため差額の -¥23,000 を支払います。決済および物流の整合性が完全に維持されます。"
	_, err = databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO barter_loops (id, status, justification) 
		VALUES (999, 'pending', ?)`, justification)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to establish barter loop: "+err.Error())
		return
	}

	// Insert Loop Members with calculated Zero-Sum price adjustments

	// Member 1 (Current User, sells Switch to Gadget Taro, wants iPad)
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO barter_loop_members (loop_id, user_id, item_id, receiver_id, cash_adjustment, shipping_status) 
		VALUES (999, ?, ?, 9992, -14000, 'pending')`, currentUserRecord.ID, itemBID)

	// Member 2 (Gadget Taro 9992, sells iPad to Fashion Hanako, wants Coat - pre-accepted)
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO barter_loop_members (loop_id, user_id, item_id, receiver_id, cash_adjustment, shipping_status) 
		VALUES (999, 9992, ?, 9993, 37000, 'accepted')`, itemCID)

	// Member 3 (Fashion Hanako 9993, sells Coat to Current User, wants Switch - pre-accepted)
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO barter_loop_members (loop_id, user_id, item_id, receiver_id, cash_adjustment, shipping_status) 
		VALUES (999, 9993, ?, ?, -23000, 'accepted')`, itemDID, currentUserRecord.ID)

	// Pre-create an active chat room / DM thread between Current User and Gadget Taro
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT IGNORE INTO conversations (id, item_id, buyer_id, seller_id) 
		VALUES (999, 9901, ?, 9992)`, currentUserRecord.ID)

	// Seed high-fidelity chat messages for conversation 999 to make the DM navigator look completely complete and alive!
	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO messages (conversation_id, sender_id, body) 
		VALUES (999, ?, 'はじめまして！こちらのiPhone 14 Proを購入させていただきます。AI交渉によって83,000円での合意となりましたので、Stripe安全決済で手続きを進めます。どうぞよろしくお願いいたします！')`, currentUserRecord.ID)

	_, _ = databaseTransaction.ExecContext(r.Context(), `
		INSERT INTO messages (conversation_id, sender_id, body) 
		VALUES (999, 9992, 'はじめまして！ご購入ありがとうございます。大阪商人AIがかなり勉強してしまったようですが（笑）、非常に良い取引ができて嬉しいです。決済の確認が取れましたので、ただいま梱包作業に入らせていただいております。発送しましたら追跡情報をお送りしますね！')`)

	// Commit transaction safely
	if err := databaseTransaction.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit demo seed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":          "success",
		"message":         "デモデータと既存商品100件のセットアップが完了しました！",
		"negotiateItemId": 9901,
		"token":           a.signToken(currentUserRecord),
		"user":            currentUserRecord,
	})
}
