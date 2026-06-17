package main

import (
	"bytes"
	"context"
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

type app struct {
	db            *sql.DB
	dbMu          sync.RWMutex
	dbStatusMu    sync.RWMutex
	dbLastError   string
	dbLastChecked time.Time
	jwtSecret     string
	openAIKey     string
	openAIModel   string
	openAIBaseURL string
	httpClient    *http.Client
	allowedOrigin string
}

type user struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	AvatarURL string `json:"avatarUrl"`
}

type item struct {
	ID          int64     `json:"id"`
	SellerID    int64     `json:"sellerId"`
	SellerName  string    `json:"sellerName"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Price       int       `json:"price"`
	Status      string    `json:"status"`
	ImageURL    string    `json:"imageUrl"`
	LikeCount   int       `json:"likeCount"`
	CreatedAt   time.Time `json:"createdAt"`
}

type conversation struct {
	ID                   int64     `json:"id"`
	ItemID               int64     `json:"itemId"`
	ItemTitle            string    `json:"itemTitle"`
	ItemPrice            int       `json:"itemPrice"`
	ItemStatus           string    `json:"itemStatus"`
	ItemImageURL         string    `json:"itemImageUrl"`
	ItemCategory         string    `json:"itemCategory"`
	BuyerID              int64     `json:"buyerId"`
	SellerID             int64     `json:"sellerId"`
	CounterpartID        int64     `json:"counterpartId"`
	CounterpartName      string    `json:"counterpartName"`
	CounterpartAvatarURL string    `json:"counterpartAvatarUrl"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type message struct {
	ID             int64     `json:"id"`
	ConversationID int64     `json:"conversationId"`
	SenderID       int64     `json:"senderId"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"createdAt"`
}

type itemReview struct {
	Prohibited      bool     `json:"prohibited"`
	RiskLevel       string   `json:"riskLevel"`
	Reasons         []string `json:"reasons"`
	BlockedKeywords []string `json:"blockedKeywords"`
}

type priceSuggestion struct {
	Price    int      `json:"price"`
	MinPrice int      `json:"minPrice"`
	MaxPrice int      `json:"maxPrice"`
	Reason   string   `json:"reason"`
	Signals  []string `json:"signals"`
}

type authUserKey struct{}

func main() {
	_ = godotenv.Load()
	a := &app{
		jwtSecret:     env("JWT_SECRET", "dev-secret"),
		openAIKey:     strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		openAIModel:   env("OPENAI_MODEL", "gpt-4o-mini"),
		openAIBaseURL: env("OPENAI_BASE_URL", "https://api.openai.com"),
		httpClient:    http.DefaultClient,
		allowedOrigin: env("ALLOWED_ORIGIN", "http://localhost:5173"),
	}
	go a.initDBLoop()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", a.health)
	mux.HandleFunc("POST /api/auth/register", a.register)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/profile", a.requireAuth(a.updateProfile))
	mux.HandleFunc("GET /api/items", a.listItems)
	mux.HandleFunc("GET /api/my/items", a.requireAuth(a.listMyItems))
	mux.HandleFunc("POST /api/items", a.requireAuth(a.createItem))
	mux.HandleFunc("POST /api/upload", a.requireAuth(a.createUploadURL))
	mux.HandleFunc("GET /api/items/{id}", a.getItem)
	mux.HandleFunc("POST /api/items/{id}/cancel", a.requireAuth(a.cancelItem))
	mux.HandleFunc("POST /api/items/{id}/like", a.requireAuth(a.toggleLike))
	mux.HandleFunc("POST /api/items/{id}/purchase", a.requireAuth(a.purchaseItem))
	mux.HandleFunc("GET /api/conversations", a.requireAuth(a.listConversations))
	mux.HandleFunc("POST /api/conversations", a.requireAuth(a.createConversation))
	mux.HandleFunc("GET /api/conversations/{id}/messages", a.requireAuth(a.listMessages))
	mux.HandleFunc("POST /api/conversations/{id}/messages", a.requireAuth(a.createMessage))
	mux.HandleFunc("POST /api/ai/generate-description", a.requireAuth(a.generateDescription))
	mux.HandleFunc("POST /api/ai/ask", a.requireAuth(a.askAI))
	mux.HandleFunc("POST /api/ai/check-item", a.requireAuth(a.checkItem))
	mux.HandleFunc("POST /api/ai/suggest-price", a.requireAuth(a.suggestPrice))

	port := env("PORT", "8080")
	log.Printf("backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, a.cors(withFrontend(a.guardDB(mux)))))
}

func (a *app) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); a.isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withFrontend(api http.Handler) http.Handler {
	staticDir, ok := findFrontendDir()
	if !ok {
		return api
	}

	fileServer := http.FileServer(http.Dir(staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			api.ServeHTTP(w, r)
			return
		}

		target := filepath.Join(staticDir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(target); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}

		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
}

func findFrontendDir() (string, bool) {
	candidates := []string{
		"./public",
		"public",
		"../frontend/dist",
	}

	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate, true
		}
	}

	return "", false
}

func (a *app) guardDB(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		if a.dbHandle() == nil {
			writeErrorDetail(w, http.StatusServiceUnavailable, "database is starting", map[string]any{
				"database": a.dbStatus(),
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) initDBLoop() {
	for {
		dsn, err := resolveDSN()
		if err != nil {
			log.Printf("database init pending: %v", err)
			a.setDBStatus(err)
			time.Sleep(5 * time.Second)
			continue
		}

		db, err := sql.Open("mysql", dsn)
		if err != nil {
			log.Printf("database open failed: %v", err)
			a.setDBStatus(err)
			time.Sleep(5 * time.Second)
			continue
		}
		db.SetMaxOpenConns(12)
		db.SetMaxIdleConns(6)
		db.SetConnMaxLifetime(30 * time.Minute)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = db.PingContext(ctx)
		if err == nil {
			err = migrate(ctx, db)
		}
		cancel()
		if err != nil {
			log.Printf("database init failed: %v", err)
			a.setDBStatus(err)
			_ = db.Close()
			time.Sleep(5 * time.Second)
			continue
		}

		a.setDB(db)
		a.setDBStatus(nil)
		log.Printf("database connected")
		return
	}
}

func (a *app) dbHandle() *sql.DB {
	a.dbMu.RLock()
	defer a.dbMu.RUnlock()
	return a.db
}

func (a *app) setDB(db *sql.DB) {
	a.dbMu.Lock()
	defer a.dbMu.Unlock()
	a.db = db
}

func (a *app) setDBStatus(err error) {
	a.dbStatusMu.Lock()
	defer a.dbStatusMu.Unlock()
	a.dbLastChecked = time.Now().UTC()
	if err != nil {
		a.dbLastError = err.Error()
		return
	}
	a.dbLastError = ""
}

func (a *app) dbStatus() map[string]any {
	a.dbStatusMu.RLock()
	defer a.dbStatusMu.RUnlock()
	status := map[string]any{
		"ready":       a.dbHandle() != nil,
		"lastChecked": "",
		"lastError":   a.dbLastError,
	}
	if !a.dbLastChecked.IsZero() {
		status["lastChecked"] = a.dbLastChecked.Format(time.RFC3339)
	}
	return status
}

func resolveDSN() (string, error) {
	if dsn := os.Getenv("DATABASE_DSN"); dsn != "" {
		return dsn, nil
	}

	dbUser := os.Getenv("DB_USER")
	dbPass := os.Getenv("DB_PASS")
	dbName := os.Getenv("DB_NAME")
	if dbUser == "" || dbPass == "" || dbName == "" {
		return "", errors.New("DATABASE_DSN is required, or set DB_USER, DB_PASS, DB_NAME, and INSTANCE_UNIX_SOCKET/DB_HOST for Cloud Run")
	}

	if unixSocket := os.Getenv("INSTANCE_UNIX_SOCKET"); unixSocket != "" {
		return fmt.Sprintf("%s:%s@unix(%s)/%s?parseTime=true&multiStatements=true", dbUser, dbPass, unixSocket, dbName), nil
	}

	host := env("DB_HOST", "")
	if host == "" {
		return "", errors.New("missing database host: set DATABASE_DSN, or DB_USER/DB_PASS/DB_NAME with INSTANCE_UNIX_SOCKET or DB_HOST")
	}

	port := env("DB_PORT", "3306")
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&multiStatements=true", dbUser, dbPass, host, port, dbName), nil
}

func (a *app) isAllowedOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	allowed := []string{
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		a.allowedOrigin,
	}
	for _, value := range strings.Split(a.allowedOrigin, ",") {
		allowed = append(allowed, strings.TrimSpace(value))
	}
	for _, value := range allowed {
		if origin == value {
			return true
		}
	}
	return false
}

func (a *app) health(w http.ResponseWriter, r *http.Request) {
	db := a.dbHandle()
	if db == nil {
		writeErrorDetail(w, http.StatusServiceUnavailable, "database unavailable", map[string]any{
			"database": a.dbStatus(),
		})
		return
	}
	if err := db.PingContext(r.Context()); err != nil {
		a.setDBStatus(err)
		writeErrorDetail(w, http.StatusServiceUnavailable, "database unavailable", map[string]any{
			"database": a.dbStatus(),
		})
		return
	}
	a.setDBStatus(nil)
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "database": a.dbStatus()})
}

func (a *app) register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Name == "" || req.Email == "" || len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "name, email, and password with at least 6 characters are required")
		return
	}

	res, err := a.dbHandle().ExecContext(r.Context(),
		"INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')",
		req.Name, strings.ToLower(req.Email), a.hashPassword(req.Password),
	)
	if err != nil {
		writeError(w, http.StatusConflict, "email is already registered")
		return
	}

	id, _ := res.LastInsertId()
	u := user{ID: id, Name: req.Name, Email: strings.ToLower(req.Email), Role: "user"}
	writeJSON(w, http.StatusCreated, map[string]any{"token": a.signToken(u), "user": u})
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	var u user
	var passwordHash string
	err := a.dbHandle().QueryRowContext(r.Context(),
		"SELECT id, name, email, role, COALESCE(avatar_url, ''), password_hash FROM users WHERE email = ?",
		strings.ToLower(req.Email),
	).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.AvatarURL, &passwordHash)
	if err != nil || passwordHash != a.hashPassword(req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"token": a.signToken(u), "user": u})
}

func (a *app) updateProfile(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		Name      string `json:"name"`
		AvatarURL string `json:"avatarUrl"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = u.Name
	}
	avatarURL := strings.TrimSpace(req.AvatarURL)
	if _, err := a.dbHandle().ExecContext(r.Context(), "UPDATE users SET name = ?, avatar_url = ? WHERE id = ?", name, avatarURL, u.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	updated, err := a.findUserByID(r.Context(), u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load profile")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": updated, "token": a.signToken(updated)})
}

func (a *app) listItems(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	minPrice, ok := optionalIntParam(w, r, "min_price")
	if !ok {
		return
	}
	maxPrice, ok := optionalIntParam(w, r, "max_price")
	if !ok {
		return
	}
	if minPrice != nil && maxPrice != nil && *minPrice > *maxPrice {
		writeError(w, http.StatusBadRequest, "min_price must be less than or equal to max_price")
		return
	}

	conditions := []string{"i.status IN ('active', 'sold')"}
	args := []any{}
	if query != "" {
		conditions = append(conditions, "(i.title LIKE ? OR i.description LIKE ?)")
		like := "%" + query + "%"
		args = append(args, like, like)
	}
	if category != "" {
		conditions = append(conditions, "i.category = ?")
		args = append(args, category)
	}
	if minPrice != nil {
		conditions = append(conditions, "i.price >= ?")
		args = append(args, *minPrice)
	}
	if maxPrice != nil {
		conditions = append(conditions, "i.price <= ?")
		args = append(args, *maxPrice)
	}

	rows, err := a.dbHandle().QueryContext(r.Context(), `
		SELECT i.id, i.seller_id, u.name, i.title, i.description, i.category, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       COUNT(l.item_id), i.created_at
		FROM items i
		JOIN users u ON u.id = i.seller_id
		LEFT JOIN likes l ON l.item_id = i.id
		WHERE `+strings.Join(conditions, " AND ")+`
		GROUP BY i.id, i.seller_id, u.name, i.title, i.description, i.category, i.price, i.status, i.created_at
		ORDER BY i.created_at DESC
		LIMIT 50`, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load items")
		return
	}
	defer rows.Close()

	items := []item{}
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.ID, &it.SellerID, &it.SellerName, &it.Title, &it.Description, &it.Category, &it.Price, &it.Status, &it.ImageURL, &it.LikeCount, &it.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read item")
			return
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read items")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *app) listMyItems(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	rows, err := a.dbHandle().QueryContext(r.Context(), `
		SELECT i.id, i.seller_id, usr.name, i.title, i.description, i.category, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       COUNT(l.item_id), i.created_at
		FROM items i
		JOIN users usr ON usr.id = i.seller_id
		LEFT JOIN likes l ON l.item_id = i.id
		WHERE i.seller_id = ?
		GROUP BY i.id, i.seller_id, usr.name, i.title, i.description, i.category, i.price, i.status, i.created_at
		ORDER BY i.created_at DESC`, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load your items")
		return
	}
	defer rows.Close()

	items := []item{}
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.ID, &it.SellerID, &it.SellerName, &it.Title, &it.Description, &it.Category, &it.Price, &it.Status, &it.ImageURL, &it.LikeCount, &it.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read item")
			return
		}
		items = append(items, it)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *app) createUploadURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Filename    string `json:"filename"`
		ContentType string `json:"contentType"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Filename = filepath.Base(strings.TrimSpace(req.Filename))
	req.ContentType = strings.TrimSpace(req.ContentType)
	if req.Filename == "." || req.Filename == "" || req.ContentType == "" || !strings.HasPrefix(req.ContentType, "image/") {
		writeError(w, http.StatusBadRequest, "画像ファイルを選択してください")
		return
	}

	signed, publicURL, err := signedGCSUploadURL(req.Filename, req.ContentType)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"uploadUrl":   signed,
		"publicUrl":   publicURL,
		"method":      http.MethodPut,
		"contentType": req.ContentType,
	})
}

func (a *app) getItem(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	it, err := a.findItem(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"item": it})
}

func (a *app) createItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Category    string `json:"category"`
		Price       int    `json:"price"`
		ImageURL    string `json:"imageUrl"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title == "" || req.Description == "" || req.Category == "" || req.Price <= 0 {
		writeError(w, http.StatusBadRequest, "title, description, category, and positive price are required")
		return
	}
	review, err := a.reviewItem(r.Context(), req.Title, req.Description, req.Category, "")
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if review.Prohibited {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "出品禁止物の可能性があるため出品できません", "review": review})
		return
	}

	tx, err := a.dbHandle().BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(r.Context(),
		"INSERT INTO items (seller_id, title, description, category, price) VALUES (?, ?, ?, ?, ?)",
		u.ID, req.Title, req.Description, req.Category, req.Price,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create item")
		return
	}
	itemID, _ := res.LastInsertId()
	if req.ImageURL != "" {
		if _, err := tx.ExecContext(r.Context(), "INSERT INTO item_images (item_id, image_url) VALUES (?, ?)", itemID, req.ImageURL); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save image")
			return
		}
	}
	if err := saveItemReview(r.Context(), tx, itemID, u.ID, review); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save item review")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit item")
		return
	}

	it, _ := a.findItem(r.Context(), itemID)
	writeJSON(w, http.StatusCreated, map[string]any{"item": it})
}

func (a *app) cancelItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	var sellerID int64
	var status string
	err := a.dbHandle().QueryRowContext(r.Context(), "SELECT seller_id, status FROM items WHERE id = ?", itemID).Scan(&sellerID, &status)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load item")
		return
	}
	if sellerID != u.ID {
		writeError(w, http.StatusForbidden, "only the seller can cancel this item")
		return
	}
	if status != "active" {
		writeError(w, http.StatusBadRequest, "only active items can be cancelled")
		return
	}
	if _, err := a.dbHandle().ExecContext(r.Context(), "UPDATE items SET status = 'hidden' WHERE id = ?", itemID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to cancel item")
		return
	}

	it, _ := a.findItem(r.Context(), itemID)
	writeJSON(w, http.StatusOK, map[string]any{"item": it})
}

func (a *app) toggleLike(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	var exists int
	err := a.dbHandle().QueryRowContext(r.Context(), "SELECT COUNT(*) FROM likes WHERE user_id = ? AND item_id = ?", u.ID, itemID).Scan(&exists)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check like")
		return
	}

	liked := exists == 0
	if liked {
		_, err = a.dbHandle().ExecContext(r.Context(), "INSERT INTO likes (user_id, item_id) VALUES (?, ?)", u.ID, itemID)
	} else {
		_, err = a.dbHandle().ExecContext(r.Context(), "DELETE FROM likes WHERE user_id = ? AND item_id = ?", u.ID, itemID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update like")
		return
	}

	var count int
	_ = a.dbHandle().QueryRowContext(r.Context(), "SELECT COUNT(*) FROM likes WHERE item_id = ?", itemID).Scan(&count)
	writeJSON(w, http.StatusOK, map[string]any{"liked": liked, "likeCount": count})
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

	var sellerID int64
	var price int
	var status string
	err = tx.QueryRowContext(r.Context(), "SELECT seller_id, price, status FROM items WHERE id = ? FOR UPDATE", itemID).Scan(&sellerID, &price, &status)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if sellerID == u.ID {
		writeError(w, http.StatusBadRequest, "seller cannot purchase own item")
		return
	}
	if status != "active" {
		writeError(w, http.StatusConflict, "item is not available")
		return
	}

	if _, err := tx.ExecContext(r.Context(), "UPDATE items SET status = 'sold' WHERE id = ?", itemID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update item")
		return
	}
	res, err := tx.ExecContext(r.Context(),
		"INSERT INTO purchases (item_id, buyer_id, seller_id, price) VALUES (?, ?, ?, ?)",
		itemID, u.ID, sellerID, price,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create purchase")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit purchase")
		return
	}
	purchaseID, _ := res.LastInsertId()
	writeJSON(w, http.StatusCreated, map[string]any{"purchaseId": purchaseID, "status": "completed"})
}

func (a *app) createConversation(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		ItemID   int64 `json:"itemId"`
		SellerID int64 `json:"sellerId"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ItemID == 0 || req.SellerID == 0 {
		writeError(w, http.StatusBadRequest, "itemId and sellerId are required")
		return
	}

	_, err := a.dbHandle().ExecContext(r.Context(),
		"INSERT IGNORE INTO conversations (item_id, buyer_id, seller_id) VALUES (?, ?, ?)",
		req.ItemID, u.ID, req.SellerID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create conversation")
		return
	}

	var id int64
	err = a.dbHandle().QueryRowContext(r.Context(),
		"SELECT id FROM conversations WHERE item_id = ? AND buyer_id = ? AND seller_id = ?",
		req.ItemID, u.ID, req.SellerID,
	).Scan(&id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load conversation")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"conversationId": id})
}

func (a *app) listConversations(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	rows, err := a.dbHandle().QueryContext(r.Context(), `
		SELECT c.id, c.item_id, i.title, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       i.category, c.buyer_id, c.seller_id,
		       CASE WHEN c.buyer_id = ? THEN c.seller_id ELSE c.buyer_id END AS counterpart_id,
		       CASE WHEN c.buyer_id = ? THEN seller.name ELSE buyer.name END AS counterpart_name,
		       CASE WHEN c.buyer_id = ? THEN COALESCE(seller.avatar_url, '') ELSE COALESCE(buyer.avatar_url, '') END AS counterpart_avatar_url,
		       c.updated_at
		FROM conversations c
		JOIN items i ON i.id = c.item_id
		JOIN users buyer ON buyer.id = c.buyer_id
		JOIN users seller ON seller.id = c.seller_id
		WHERE c.buyer_id = ? OR c.seller_id = ?
		ORDER BY c.updated_at DESC`, u.ID, u.ID, u.ID, u.ID, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load conversations")
		return
	}
	defer rows.Close()

	conversations := []conversation{}
	for rows.Next() {
		var c conversation
		if err := rows.Scan(
			&c.ID, &c.ItemID, &c.ItemTitle, &c.ItemPrice, &c.ItemStatus,
			&c.ItemImageURL, &c.ItemCategory, &c.BuyerID, &c.SellerID,
			&c.CounterpartID, &c.CounterpartName, &c.CounterpartAvatarURL, &c.UpdatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read conversation")
			return
		}
		conversations = append(conversations, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"conversations": conversations})
}

func (a *app) listMessages(w http.ResponseWriter, r *http.Request) {
	conversationID, ok := pathID(w, r)
	if !ok {
		return
	}
	rows, err := a.dbHandle().QueryContext(r.Context(),
		"SELECT id, conversation_id, sender_id, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
		conversationID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load messages")
		return
	}
	defer rows.Close()

	messages := []message{}
	for rows.Next() {
		var m message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read message")
			return
		}
		messages = append(messages, m)
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": messages})
}

func (a *app) createMessage(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	conversationID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Body) == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}

	res, err := a.dbHandle().ExecContext(r.Context(),
		"INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)",
		conversationID, u.ID, req.Body,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create message")
		return
	}
	_, _ = a.dbHandle().ExecContext(r.Context(), "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", conversationID)
	id, _ := res.LastInsertId()
	writeJSON(w, http.StatusCreated, map[string]any{"messageId": id})
}

func (a *app) generateDescription(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		Title     string `json:"title"`
		Category  string `json:"category"`
		Condition string `json:"condition"`
		Notes     string `json:"notes"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	prompt := fmt.Sprintf("フリマアプリの商品説明を日本語で作成してください。誇張せず、状態を正直に書いてください。\n商品名: %s\nカテゴリ: %s\n状態: %s\nメモ: %s", req.Title, req.Category, req.Condition, req.Notes)
	text, err := a.callOpenAI(r.Context(), prompt)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	a.saveAI(r.Context(), u.ID, nil, "description", prompt, text)
	writeJSON(w, http.StatusOK, map[string]string{"description": text})
}

func (a *app) checkItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Category    string `json:"category"`
		Condition   string `json:"condition"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Title) == "" || strings.TrimSpace(req.Description) == "" {
		writeError(w, http.StatusBadRequest, "title and description are required")
		return
	}
	prompt := itemReviewPrompt(req.Title, req.Description, req.Category, req.Condition)
	review, err := a.reviewItemWithPrompt(r.Context(), prompt)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	a.saveAI(r.Context(), u.ID, nil, "item_check", prompt, mustJSON(review))
	writeJSON(w, http.StatusOK, map[string]any{"review": review})
}

func (a *app) askAI(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		ItemID   int64  `json:"itemId"`
		Question string `json:"question"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	it, err := a.findItem(r.Context(), req.ItemID)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	prompt := fmt.Sprintf("あなたはフリマアプリの購入相談AIです。商品情報だけを根拠に、短く実用的に回答して。答えのみを端的に出力して。「承知しました」みたいな文言は一切いらない。\n商品名: %s\nカテゴリ: %s\n価格: %d円\n説明: %s\n質問: %s", it.Title, it.Category, it.Price, it.Description, req.Question)
	text, err := a.callOpenAI(r.Context(), prompt)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	a.saveAI(r.Context(), u.ID, &req.ItemID, "question", prompt, text)
	writeJSON(w, http.StatusOK, map[string]string{"answer": text})
}

func (a *app) suggestPrice(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		Title     string `json:"title"`
		Category  string `json:"category"`
		Condition string `json:"condition"`
		Notes     string `json:"notes"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Title) == "" || strings.TrimSpace(req.Category) == "" {
		writeError(w, http.StatusBadRequest, "title and category are required")
		return
	}
	prompt := priceSuggestionPrompt(req.Title, req.Category, req.Condition, req.Notes)
	var suggestion priceSuggestion
	if err := a.callOpenAIJSON(r.Context(), prompt, &suggestion); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	suggestion.Price = clampPrice(suggestion.Price)
	if suggestion.MinPrice <= 0 || suggestion.MinPrice > suggestion.Price {
		suggestion.MinPrice = clampPrice(suggestion.Price * 8 / 10)
	}
	if suggestion.MaxPrice < suggestion.Price {
		suggestion.MaxPrice = clampPrice(suggestion.Price * 12 / 10)
	}
	a.saveAI(r.Context(), u.ID, nil, "price_suggestion", prompt, mustJSON(suggestion))
	writeJSON(w, http.StatusOK, map[string]any{"suggestion": suggestion})
}

func (a *app) findItem(ctx context.Context, id int64) (item, error) {
	var it item
	err := a.dbHandle().QueryRowContext(ctx, `
		SELECT i.id, i.seller_id, u.name, i.title, i.description, i.category, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       (SELECT COUNT(*) FROM likes WHERE item_id = i.id), i.created_at
		FROM items i
		JOIN users u ON u.id = i.seller_id
		WHERE i.id = ?`, id,
	).Scan(&it.ID, &it.SellerID, &it.SellerName, &it.Title, &it.Description, &it.Category, &it.Price, &it.Status, &it.ImageURL, &it.LikeCount, &it.CreatedAt)
	return it, err
}

func (a *app) findUserByID(ctx context.Context, id int64) (user, error) {
	var u user
	err := a.dbHandle().QueryRowContext(ctx,
		"SELECT id, name, email, role, COALESCE(avatar_url, '') FROM users WHERE id = ?",
		id,
	).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.AvatarURL)
	return u, err
}

func (a *app) reviewItem(ctx context.Context, title string, description string, category string, condition string) (itemReview, error) {
	return a.reviewItemWithPrompt(ctx, itemReviewPrompt(title, description, category, condition))
}

func (a *app) reviewItemWithPrompt(ctx context.Context, prompt string) (itemReview, error) {
	var review itemReview
	if err := a.callOpenAIJSON(ctx, prompt, &review); err != nil {
		return itemReview{}, err
	}
	review.RiskLevel = normalizeRiskLevel(review.RiskLevel, review.Prohibited)
	review.Reasons = cleanStrings(review.Reasons)
	review.BlockedKeywords = cleanStrings(review.BlockedKeywords)
	return review, nil
}

func (a *app) saveAI(ctx context.Context, userID int64, itemID *int64, kind string, prompt string, result string) {
	_, _ = a.dbHandle().ExecContext(ctx,
		"INSERT INTO ai_generations (user_id, item_id, kind, prompt, result) VALUES (?, ?, ?, ?, ?)",
		userID, itemID, kind, prompt, result,
	)
}

func saveItemReview(ctx context.Context, tx *sql.Tx, itemID int64, userID int64, review itemReview) error {
	_, err := tx.ExecContext(ctx,
		"INSERT INTO item_moderations (item_id, user_id, prohibited, risk_level, reasons, blocked_keywords) VALUES (?, ?, ?, ?, ?, ?)",
		itemID, userID, review.Prohibited, review.RiskLevel, strings.Join(review.Reasons, "\n"), strings.Join(review.BlockedKeywords, ","),
	)
	return err
}

func (a *app) callOpenAI(ctx context.Context, prompt string) (string, error) {
	return a.callOpenAIWithFormat(ctx, prompt, nil)
}

func (a *app) callOpenAIJSON(ctx context.Context, prompt string, dst any) error {
	text, err := a.callOpenAIWithFormat(ctx, prompt, map[string]string{"type": "json_object"})
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(extractJSONObject(text)), dst)
}

func (a *app) callOpenAIWithFormat(ctx context.Context, prompt string, responseFormat any) (string, error) {
	if a.openAIKey == "" {
		return "", errors.New("OPENAI_API_KEY is not set")
	}
	body := map[string]any{
		"model": a.openAIModel,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"temperature": 0.4,
	}
	if responseFormat != nil {
		body["response_format"] = responseFormat
	}
	payload, _ := json.Marshal(body)
	endpoint, err := url.JoinPath(a.openAIBaseURL, "/v1/chat/completions")
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.openAIKey)

	client := a.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	resBody, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("openai api error: %s", string(resBody))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", errors.New("openai returned empty response")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

func itemReviewPrompt(title string, description string, category string, condition string) string {
	return fmt.Sprintf(`あなたは日本のフリマアプリの安全審査AIです。出品禁止物の可能性を審査してください。
禁止対象例: 刃物、医薬品、処方薬、危険物、武器、偽ブランド、盗品、個人情報、成人向け商品、チケット転売、法令や規約に反するもの。
必ずJSONだけで返してください。形式: {"prohibited":true|false,"riskLevel":"low|medium|high","reasons":["理由"],"blockedKeywords":["検出語"]}
商品名: %s
カテゴリ: %s
状態: %s
説明: %s`, title, category, condition, description)
}

func priceSuggestionPrompt(title string, category string, condition string, notes string) string {
	return fmt.Sprintf(`あなたはフリマアプリの価格アドバイザーです。日本円で現実的な出品価格を提案してください。
必ずJSONだけで返してください。形式: {"price":整数,"minPrice":整数,"maxPrice":整数,"reason":"短い理由","signals":["判断材料"]}
商品名: %s
カテゴリ: %s
状態: %s
メモ: %s`, title, category, condition, notes)
}

func normalizeRiskLevel(value string, prohibited bool) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "low", "medium", "high":
		return value
	}
	if prohibited {
		return "high"
	}
	return "low"
}

func cleanStrings(values []string) []string {
	cleaned := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		cleaned = append(cleaned, value)
	}
	return cleaned
}

func clampPrice(value int) int {
	if value < 300 {
		return 300
	}
	if value > 9999999 {
		return 9999999
	}
	return value
}

func extractJSONObject(text string) string {
	text = strings.TrimSpace(text)
	if json.Valid([]byte(text)) {
		return text
	}
	re := regexp.MustCompile(`(?s)\{.*\}`)
	match := re.FindString(text)
	if match == "" {
		return text
	}
	return match
}

func mustJSON(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func (a *app) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		u, err := a.verifyToken(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), authUserKey{}, u)))
	}
}

func currentUser(r *http.Request) user {
	u, _ := r.Context().Value(authUserKey{}).(user)
	return u
}

func (a *app) hashPassword(password string) string {
	sum := sha256.Sum256([]byte(password + ":" + a.jwtSecret))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (a *app) signToken(u user) string {
	header := base64JSON(map[string]string{"alg": "HS256", "typ": "JWT"})
	payload := base64JSON(map[string]any{
		"sub":   u.ID,
		"name":  u.Name,
		"email": u.Email,
		"role":  u.Role,
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	})
	unsigned := header + "." + payload
	return unsigned + "." + hmacSHA256(unsigned, a.jwtSecret)
}

func (a *app) verifyToken(token string) (user, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return user{}, errors.New("invalid token")
	}
	expected := hmacSHA256(parts[0]+"."+parts[1], a.jwtSecret)
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return user{}, errors.New("invalid signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return user{}, err
	}
	var claims struct {
		Sub   int64  `json:"sub"`
		Name  string `json:"name"`
		Email string `json:"email"`
		Role  string `json:"role"`
		Exp   int64  `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return user{}, err
	}
	if time.Now().Unix() > claims.Exp {
		return user{}, errors.New("token expired")
	}
	return user{ID: claims.Sub, Name: claims.Name, Email: claims.Email, Role: claims.Role}, nil
}

func migrate(ctx context.Context, db *sql.DB) error {
	data, err := os.ReadFile("migrations/001_init.sql")
	if err != nil {
		return err
	}
	for _, stmt := range strings.Split(string(data), ";") {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	if _, err := db.ExecContext(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL AFTER role"); err != nil {
		return err
	}
	return nil
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeErrorDetail(w http.ResponseWriter, status int, msg string, detail map[string]any) {
	body := map[string]any{"error": msg}
	for key, value := range detail {
		body[key] = value
	}
	writeJSON(w, status, body)
}

func optionalIntParam(w http.ResponseWriter, r *http.Request, key string) (*int, bool) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return nil, true
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		writeError(w, http.StatusBadRequest, key+" must be a non-negative integer")
		return nil, false
	}
	return &parsed, true
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}

func signedGCSUploadURL(filename string, contentType string) (string, string, error) {
	bucket := strings.TrimSpace(os.Getenv("GCS_BUCKET"))
	clientEmail := strings.TrimSpace(os.Getenv("GCS_CLIENT_EMAIL"))
	privateKeyText := strings.TrimSpace(os.Getenv("GCS_PRIVATE_KEY"))
	if bucket == "" || clientEmail == "" || privateKeyText == "" {
		return "", "", errors.New("画像アップロード設定が未設定です: GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY を設定してください")
	}

	privateKey, err := parseRSAPrivateKey(privateKeyText)
	if err != nil {
		return "", "", errors.New("GCS_PRIVATE_KEY を読み込めませんでした")
	}

	now := time.Now().UTC()
	datestamp := now.Format("20060102")
	timestamp := now.Format("20060102T150405Z")
	objectName := fmt.Sprintf("items/%s-%s", now.Format("20060102150405"), sanitizeObjectName(filename))
	credentialScope := datestamp + "/auto/storage/goog4_request"
	credential := clientEmail + "/" + credentialScope
	expires := "900"
	escapedObject := "/" + escapeObjectPath(objectName)

	query := url.Values{}
	query.Set("X-Goog-Algorithm", "GOOG4-RSA-SHA256")
	query.Set("X-Goog-Credential", credential)
	query.Set("X-Goog-Date", timestamp)
	query.Set("X-Goog-Expires", expires)
	query.Set("X-Goog-SignedHeaders", "content-type;host")

	canonicalRequest := strings.Join([]string{
		http.MethodPut,
		escapedObject,
		query.Encode(),
		"content-type:" + contentType + "\n" + "host:storage.googleapis.com\n",
		"content-type;host",
		"UNSIGNED-PAYLOAD",
	}, "\n")
	canonicalHash := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"GOOG4-RSA-SHA256",
		timestamp,
		credentialScope,
		hex.EncodeToString(canonicalHash[:]),
	}, "\n")
	signHash := sha256.Sum256([]byte(stringToSign))
	signatureBytes, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, signHash[:])
	if err != nil {
		return "", "", errors.New("署名付きURLの発行に失敗しました")
	}
	query.Set("X-Goog-Signature", hex.EncodeToString(signatureBytes))

	publicURL := fmt.Sprintf("https://storage.googleapis.com/%s/%s", bucket, escapeObjectPath(objectName))
	uploadURL := fmt.Sprintf("https://storage.googleapis.com/%s%s?%s", bucket, escapedObject, query.Encode())
	return uploadURL, publicURL, nil
}

func parseRSAPrivateKey(value string) (*rsa.PrivateKey, error) {
	value = strings.ReplaceAll(value, `\n`, "\n")
	block, _ := pem.Decode([]byte(value))
	if block == nil {
		return nil, errors.New("missing pem block")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func sanitizeObjectName(filename string) string {
	name := strings.ToLower(filename)
	replacer := strings.NewReplacer(" ", "-", "/", "-", "\\", "-", ":", "-", "?", "-", "&", "-")
	name = replacer.Replace(name)
	name = strings.Trim(name, ".-")
	if name == "" {
		return "upload"
	}
	return name
}

func escapeObjectPath(objectName string) string {
	parts := strings.Split(objectName, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func base64JSON(v any) string {
	b, _ := json.Marshal(v)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hmacSHA256(value string, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
