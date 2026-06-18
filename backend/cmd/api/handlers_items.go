package main

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"
)

func (a *app) listItems(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	category := r.URL.Query().Get("category")
	minPriceStr := r.URL.Query().Get("min_price")
	maxPriceStr := r.URL.Query().Get("max_price")

	var conds []string
	var args []any
	conds = append(conds, "i.status IN ('active', 'sold')")

	if q != "" {
		conds = append(conds, "(i.title LIKE ? OR i.description LIKE ?)")
		args = append(args, "%"+q+"%", "%"+q+"%")
	}
	if category != "" {
		conds = append(conds, "i.category = ?")
		args = append(args, category)
	}
	if minPriceStr != "" {
		if minPrice, err := strconv.Atoi(minPriceStr); err == nil {
			conds = append(conds, "i.price >= ?")
			args = append(args, minPrice)
		}
	}
	if maxPriceStr != "" {
		if maxPrice, err := strconv.Atoi(maxPriceStr); err == nil {
			conds = append(conds, "i.price <= ?")
			args = append(args, maxPrice)
		}
	}

	query := `
		SELECT i.id, i.seller_id, u.name, COALESCE(u.avatar_url, ''),
		       COALESCE((SELECT AVG(rating) FROM user_reviews WHERE reviewee_id = i.seller_id), 0),
		       (SELECT COUNT(*) FROM user_reviews WHERE reviewee_id = i.seller_id),
		       (SELECT COUNT(*) FROM purchases WHERE seller_id = i.seller_id),
		       i.title, i.description, i.category, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       (SELECT COUNT(*) FROM likes WHERE item_id = i.id), i.created_at
		FROM items i
		JOIN users u ON u.id = i.seller_id
	`
	if len(conds) > 0 {
		query += " WHERE " + strings.Join(conds, " AND ")
	}
	query += " ORDER BY i.created_at DESC"

	rows, err := a.dbHandle().QueryContext(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load items: "+err.Error())
		return
	}
	defer rows.Close()

	items := []item{}
	for rows.Next() {
		var it item
		if err := rows.Scan(
			&it.ID, &it.SellerID, &it.SellerName, &it.SellerAvatarURL, &it.SellerRatingAvg, &it.SellerRatingCount, &it.SellerTxCount,
			&it.Title, &it.Description, &it.Category, &it.Price, &it.Status, &it.ImageURL,
			&it.LikeCount, &it.CreatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read item: "+err.Error())
			return
		}
		items = append(items, it)
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *app) listMyItems(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	rows, err := a.dbHandle().QueryContext(r.Context(), `
		SELECT i.id, i.seller_id, u.name, COALESCE(u.avatar_url, ''),
		       COALESCE((SELECT AVG(rating) FROM user_reviews WHERE reviewee_id = i.seller_id), 0),
		       (SELECT COUNT(*) FROM user_reviews WHERE reviewee_id = i.seller_id),
		       (SELECT COUNT(*) FROM purchases WHERE seller_id = i.seller_id),
		       i.title, i.description, i.category, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       (SELECT COUNT(*) FROM likes WHERE item_id = i.id), i.created_at
		FROM items i
		JOIN users u ON u.id = i.seller_id
		WHERE i.seller_id = ?
		ORDER BY i.created_at DESC`, u.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load my items: "+err.Error())
		return
	}
	defer rows.Close()

	items := []item{}
	for rows.Next() {
		var it item
		if err := rows.Scan(
			&it.ID, &it.SellerID, &it.SellerName, &it.SellerAvatarURL, &it.SellerRatingAvg, &it.SellerRatingCount, &it.SellerTxCount,
			&it.Title, &it.Description, &it.Category, &it.Price, &it.Status, &it.ImageURL,
			&it.LikeCount, &it.CreatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read item")
			return
		}
		items = append(items, it)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *app) getItem(w http.ResponseWriter, r *http.Request) {
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	it, err := a.findItem(r.Context(), itemID)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}

	images, err := a.getItemImages(r.Context(), itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load images")
		return
	}

	var liked bool
	if u := currentUser(r); u.ID > 0 {
		var dummy int
		err := a.dbHandle().QueryRowContext(r.Context(), "SELECT 1 FROM likes WHERE item_id = ? AND user_id = ?", itemID, u.ID).Scan(&dummy)
		liked = err == nil
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"item":   it,
		"images": images,
		"liked":  liked,
	})
}

func (a *app) createItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		Title         string   `json:"title"`
		Description   string   `json:"description"`
		Category      string   `json:"category"`
		Price         int      `json:"price"`
		MinPrice      int      `json:"minPrice"`
		AIPersonality string   `json:"aiPersonality"`
		BarterEnabled bool     `json:"barterEnabled"`
		WantCategory  string   `json:"wantCategory"`
		ImageURLs     []string `json:"imageUrls"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title == "" || req.Description == "" || req.Category == "" || req.Price <= 0 {
		writeError(w, http.StatusBadRequest, "title, description, category, and positive price are required")
		return
	}
	if req.AIPersonality == "" {
		req.AIPersonality = "standard"
	}

	tx, err := a.dbHandle().BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(r.Context(),
		"INSERT INTO items (seller_id, title, description, category, price, min_price, ai_personality, barter_enabled, want_category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')",
		u.ID, req.Title, req.Description, req.Category, req.Price, req.MinPrice, req.AIPersonality, req.BarterEnabled, req.WantCategory,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create item: "+err.Error())
		return
	}

	itemID, _ := res.LastInsertId()
	for i, imgURL := range req.ImageURLs {
		if _, err := tx.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, ?, ?)", itemID, imgURL, i); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save item images")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	it, _ := a.findItem(r.Context(), itemID)
	writeJSON(w, http.StatusCreated, map[string]any{"item": it})
}

func (a *app) toggleLike(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	db := a.dbHandle()
	var dummy int
	err := db.QueryRowContext(r.Context(), "SELECT 1 FROM likes WHERE item_id = ? AND user_id = ?", itemID, u.ID).Scan(&dummy)
	if err == sql.ErrNoRows {
		_, err = db.ExecContext(r.Context(), "INSERT INTO likes (item_id, user_id) VALUES (?, ?)", itemID, u.ID)
	} else if err == nil {
		_, err = db.ExecContext(r.Context(), "DELETE FROM likes WHERE item_id = ? AND user_id = ?", itemID, u.ID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to toggle like")
		return
	}

	var count int
	_ = db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM likes WHERE item_id = ?", itemID).Scan(&count)
	writeJSON(w, http.StatusOK, map[string]any{"liked": err == sql.ErrNoRows, "likeCount": count})
}

func (a *app) purchaseItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	tx, err := a.dbHandle().BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback()

	var it item
	err = tx.QueryRowContext(r.Context(), "SELECT id, seller_id, price, status FROM items WHERE id = ? FOR UPDATE", itemID).Scan(&it.ID, &it.SellerID, &it.Price, &it.Status)
	if err != nil || it.Status != "active" {
		writeError(w, http.StatusConflict, "item is not active or already purchased")
		return
	}

	if it.SellerID == u.ID {
		writeError(w, http.StatusBadRequest, "you cannot purchase your own item")
		return
	}

	if _, err := tx.ExecContext(r.Context(), "UPDATE items SET status = 'sold' WHERE id = ?", itemID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update item status")
		return
	}

	if _, err := tx.ExecContext(r.Context(), "INSERT INTO purchases (item_id, buyer_id, seller_id, price, status) VALUES (?, ?, ?, ?, 'paid')", itemID, u.ID, it.SellerID, it.Price); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create purchase record")
		return
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (a *app) cancelItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	it, err := a.findItem(r.Context(), itemID)
	if err != nil || it.SellerID != u.ID || it.Status != "active" {
		writeError(w, http.StatusForbidden, "unauthorized or item is not active")
		return
	}

	_, err = a.dbHandle().ExecContext(r.Context(), "UPDATE items SET status = 'hidden' WHERE id = ?", itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update item status")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (a *app) createUploadURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Filename    string `json:"filename"`
		ContentType string `json:"contentType"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Filename == "" || req.ContentType == "" {
		writeError(w, http.StatusBadRequest, "filename and contentType are required")
		return
	}

	uploadURL, publicURL, _, err := signedGCSUploadURL("item-images", req.Filename, req.ContentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"uploadUrl": uploadURL,
		"publicUrl": publicURL,
	})
}

func (a *app) listItemReviews(w http.ResponseWriter, r *http.Request) {
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	rows, err := a.dbHandle().QueryContext(r.Context(), `
		SELECT ur.id, ur.purchase_id, ur.item_id, i.title, ur.reviewer_id, u_rev.name, ur.reviewee_id, u_ee.name, ur.rating, ur.comment, ur.created_at
		FROM user_reviews ur
		JOIN items i ON i.id = ur.item_id
		JOIN users u_rev ON u_rev.id = ur.reviewer_id
		JOIN users u_ee ON u_ee.id = ur.reviewee_id
		WHERE ur.item_id = ?
		ORDER BY ur.created_at DESC`, itemID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load reviews")
		return
	}
	defer rows.Close()

	reviews := []userReview{}
	for rows.Next() {
		var rev userReview
		if err := rows.Scan(&rev.ID, &rev.PurchaseID, &rev.ItemID, &rev.ItemTitle, &rev.ReviewerID, &rev.ReviewerName, &rev.RevieweeID, &rev.RevieweeName, &rev.Rating, &rev.Comment, &rev.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read review")
			return
		}
		reviews = append(reviews, rev)
	}
	writeJSON(w, http.StatusOK, map[string]any{"reviews": reviews})
}

func (a *app) listUserReviews(w http.ResponseWriter, r *http.Request) {
	userID, ok := pathID(w, r)
	if !ok {
		return
	}

	rows, err := a.dbHandle().QueryContext(r.Context(), `
		SELECT ur.id, ur.purchase_id, ur.item_id, i.title, ur.reviewer_id, u_rev.name, ur.reviewee_id, u_ee.name, ur.rating, ur.comment, ur.created_at
		FROM user_reviews ur
		JOIN items i ON i.id = ur.item_id
		JOIN users u_rev ON u_rev.id = ur.reviewer_id
		JOIN users u_ee ON u_ee.id = ur.reviewee_id
		WHERE ur.reviewee_id = ?
		ORDER BY ur.created_at DESC`, userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user reviews")
		return
	}
	defer rows.Close()

	reviews := []userReview{}
	for rows.Next() {
		var rev userReview
		if err := rows.Scan(&rev.ID, &rev.PurchaseID, &rev.ItemID, &rev.ItemTitle, &rev.ReviewerID, &rev.ReviewerName, &rev.RevieweeID, &rev.RevieweeName, &rev.Rating, &rev.Comment, &rev.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read review")
			return
		}
		reviews = append(reviews, rev)
	}
	writeJSON(w, http.StatusOK, map[string]any{"reviews": reviews})
}

func (a *app) createUserReview(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	var req struct {
		PurchaseID int64  `json:"purchaseId"`
		Rating     int    `json:"rating"`
		Comment    string `json:"comment"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Rating < 1 || req.Rating > 5 {
		writeError(w, http.StatusBadRequest, "rating must be between 1 and 5")
		return
	}

	var buyerID, sellerID int64
	err := a.dbHandle().QueryRowContext(r.Context(), "SELECT buyer_id, seller_id FROM purchases WHERE id = ?", req.PurchaseID).Scan(&buyerID, &sellerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "purchase record not found")
		return
	}

	var revieweeID int64
	if u.ID == buyerID {
		revieweeID = sellerID
	} else if u.ID == sellerID {
		revieweeID = buyerID
	} else {
		writeError(w, http.StatusForbidden, "you are not authorized to review this transaction")
		return
	}

	_, err = a.dbHandle().ExecContext(r.Context(),
		"INSERT INTO user_reviews (purchase_id, item_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)",
		req.PurchaseID, itemID, u.ID, revieweeID, req.Rating, req.Comment,
	)
	if err != nil {
		writeError(w, http.StatusConflict, "you have already submitted a review for this item")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"status": "ok"})
}

func (a *app) findItem(ctx context.Context, id int64) (item, error) {
	var it item
	err := a.dbHandle().QueryRowContext(ctx, `
		SELECT i.id, i.seller_id, u.name, COALESCE(u.avatar_url, ''),
		       COALESCE((SELECT AVG(rating) FROM user_reviews WHERE reviewee_id = i.seller_id), 0),
		       (SELECT COUNT(*) FROM user_reviews WHERE reviewee_id = i.seller_id),
		       (SELECT COUNT(*) FROM purchases WHERE seller_id = i.seller_id),
		       i.title, i.description, i.category, i.price, i.min_price, i.ai_personality, i.barter_enabled, i.want_category, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       (SELECT COUNT(*) FROM likes WHERE item_id = i.id), i.created_at
		FROM items i
		JOIN users u ON u.id = i.seller_id
		WHERE i.id = ?`, id,
	).Scan(
		&it.ID, &it.SellerID, &it.SellerName, &it.SellerAvatarURL, &it.SellerRatingAvg, &it.SellerRatingCount, &it.SellerTxCount,
		&it.Title, &it.Description, &it.Category, &it.Price, &it.MinPrice, &it.AIPersonality, &it.BarterEnabled, &it.WantCategory, &it.Status, &it.ImageURL,
		&it.LikeCount, &it.CreatedAt,
	)
	return it, err
}

func (a *app) getItemImages(ctx context.Context, itemID int64) ([]string, error) {
	rows, err := a.dbHandle().QueryContext(ctx, "SELECT image_url FROM item_images WHERE item_id = ? ORDER BY sort_order", itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var images []string
	for rows.Next() {
		var imgURL string
		if err := rows.Scan(&imgURL); err != nil {
			return nil, err
		}
		images = append(images, imgURL)
	}
	return images, nil
}

func (a *app) getMyStats(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	db := a.dbHandle()
	if db == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	var stats personalStatsSummary

	_ = db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM purchases WHERE seller_id = ?", u.ID).Scan(&stats.TotalSales)
	_ = db.QueryRowContext(r.Context(), "SELECT COALESCE(SUM(price), 0) FROM purchases WHERE seller_id = ?", u.ID).Scan(&stats.TotalRevenue)
	_ = db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM items WHERE seller_id = ? AND status = 'active'", u.ID).Scan(&stats.ActiveItems)
	_ = db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM likes WHERE item_id IN (SELECT id FROM items WHERE seller_id = ?)", u.ID).Scan(&stats.TotalLikes)

	cRows, err := db.QueryContext(r.Context(), `
		SELECT category, COUNT(*), COALESCE(SUM(price), 0)
		FROM items
		WHERE seller_id = ?
		GROUP BY category`, u.ID,
	)
	var categoryStats []categoryStat
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var cs categoryStat
			if err := cRows.Scan(&cs.Category, &cs.ItemCount, &cs.TotalRevenue); err == nil {
				categoryStats = append(categoryStats, cs)
			}
		}
	}

	dRows, err := db.QueryContext(r.Context(), `
		SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as dt, COALESCE(SUM(price), 0)
		FROM purchases
		WHERE seller_id = ? AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
		GROUP BY dt
		ORDER BY dt ASC`, u.ID,
	)
	var dailyRevenue []dailyTransaction
	if err == nil {
		defer dRows.Close()
		for dRows.Next() {
			var dt dailyTransaction
			if err := dRows.Scan(&dt.Date, &dt.Amount); err == nil {
				dailyRevenue = append(dailyRevenue, dt)
			}
		}
	}

	writeJSON(w, http.StatusOK, personalStatsResponse{
		Summary:              stats,
		CategoryDistribution: categoryStats,
		DailyRevenue:         dailyRevenue,
	})
}

type categoryStat struct {
	Category     string `json:"category"`
	ItemCount    int64  `json:"itemCount"`
	TotalRevenue int64  `json:"totalRevenue"`
}

type dailyTransaction struct {
	Date   string `json:"date"`
	Amount int64  `json:"amount"`
}

type personalStatsSummary struct {
	TotalSales   int64 `json:"totalSales"`
	TotalRevenue int64 `json:"totalRevenue"`
	ActiveItems  int64 `json:"activeItems"`
	TotalLikes   int64 `json:"totalLikes"`
}

type personalStatsResponse struct {
	Summary              personalStatsSummary `json:"summary"`
	CategoryDistribution []categoryStat       `json:"categoryDistribution"`
	DailyRevenue         []dailyTransaction   `json:"dailyRevenue"`
}

func (a *app) shipPurchase(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	purchaseID, ok := pathID(w, r)
	if !ok {
		return
	}

	db := a.dbHandle()
	var sellerID int64
	var status string
	err := db.QueryRowContext(r.Context(), "SELECT seller_id, status FROM purchases WHERE id = ?", purchaseID).Scan(&sellerID, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "取引情報が見つかりませんでした")
		} else {
			writeError(w, http.StatusInternalServerError, "DBエラーが発生しました: "+err.Error())
		}
		return
	}

	if sellerID != u.ID {
		writeError(w, http.StatusForbidden, "出品者のみ発送通知を行えます")
		return
	}

	if status != "paid" {
		writeError(w, http.StatusConflict, "支払完了状態（paid）の取引のみ発送できます")
		return
	}

	_, err = db.ExecContext(r.Context(), "UPDATE purchases SET status = 'shipped' WHERE id = ?", purchaseID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "発送情報の更新に失敗しました")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "shipped"})
}

func (a *app) receivePurchase(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	purchaseID, ok := pathID(w, r)
	if !ok {
		return
	}

	db := a.dbHandle()
	var buyerID int64
	var status string
	err := db.QueryRowContext(r.Context(), "SELECT buyer_id, status FROM purchases WHERE id = ?", purchaseID).Scan(&buyerID, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "取引情報が見つかりませんでした")
		} else {
			writeError(w, http.StatusInternalServerError, "DBエラーが発生しました: "+err.Error())
		}
		return
	}

	if buyerID != u.ID {
		writeError(w, http.StatusForbidden, "購入者のみ受取評価を行えます")
		return
	}

	if status != "shipped" {
		writeError(w, http.StatusConflict, "発送済み状態（shipped）の取引のみ受取完了にできます")
		return
	}

	_, err = db.ExecContext(r.Context(), "UPDATE purchases SET status = 'completed' WHERE id = ?", purchaseID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "受取評価の更新に失敗しました")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "completed"})
}
