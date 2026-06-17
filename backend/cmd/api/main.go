package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
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
	jwtSecret     string
	geminiKey     string
	geminiModel   string
	allowedOrigin string
}

type user struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
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
	ID        int64     `json:"id"`
	ItemID    int64     `json:"itemId"`
	ItemTitle string    `json:"itemTitle"`
	BuyerID   int64     `json:"buyerId"`
	SellerID  int64     `json:"sellerId"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type message struct {
	ID             int64     `json:"id"`
	ConversationID int64     `json:"conversationId"`
	SenderID       int64     `json:"senderId"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"createdAt"`
}

type authUserKey struct{}

func main() {
	_ = godotenv.Load()
	a := &app{
		jwtSecret:     env("JWT_SECRET", "dev-secret"),
		geminiKey:     os.Getenv("GEMINI_API_KEY"),
		geminiModel:   env("GEMINI_MODEL", "gemini-2.5-flash"),
		allowedOrigin: env("ALLOWED_ORIGIN", "http://localhost:5173"),
	}
	go a.initDBLoop()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", a.health)
	mux.HandleFunc("POST /api/auth/register", a.register)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("GET /api/items", a.listItems)
	mux.HandleFunc("POST /api/items", a.requireAuth(a.createItem))
	mux.HandleFunc("GET /api/items/{id}", a.getItem)
	mux.HandleFunc("POST /api/items/{id}/like", a.requireAuth(a.toggleLike))
	mux.HandleFunc("POST /api/items/{id}/purchase", a.requireAuth(a.purchaseItem))
	mux.HandleFunc("GET /api/conversations", a.requireAuth(a.listConversations))
	mux.HandleFunc("POST /api/conversations", a.requireAuth(a.createConversation))
	mux.HandleFunc("GET /api/conversations/{id}/messages", a.requireAuth(a.listMessages))
	mux.HandleFunc("POST /api/conversations/{id}/messages", a.requireAuth(a.createMessage))
	mux.HandleFunc("POST /api/ai/generate-description", a.requireAuth(a.generateDescription))
	mux.HandleFunc("POST /api/ai/ask", a.requireAuth(a.askAI))

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
			writeError(w, http.StatusServiceUnavailable, "database is starting")
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
			time.Sleep(5 * time.Second)
			continue
		}

		db, err := sql.Open("mysql", dsn)
		if err != nil {
			log.Printf("database open failed: %v", err)
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
			_ = db.Close()
			time.Sleep(5 * time.Second)
			continue
		}

		a.setDB(db)
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
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	if err := db.PingContext(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
		"SELECT id, name, email, role, password_hash FROM users WHERE email = ?",
		strings.ToLower(req.Email),
	).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &passwordHash)
	if err != nil || passwordHash != a.hashPassword(req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"token": a.signToken(u), "user": u})
}

func (a *app) listItems(w http.ResponseWriter, r *http.Request) {
	rows, err := a.dbHandle().QueryContext(r.Context(), `
		SELECT i.id, i.seller_id, u.name, i.title, i.description, i.category, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       COUNT(l.item_id), i.created_at
		FROM items i
		JOIN users u ON u.id = i.seller_id
		LEFT JOIN likes l ON l.item_id = i.id
		WHERE i.status IN ('active', 'sold')
		GROUP BY i.id, i.seller_id, u.name, i.title, i.description, i.category, i.price, i.status, i.created_at
		ORDER BY i.created_at DESC
		LIMIT 50`)
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
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit item")
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
		SELECT c.id, c.item_id, i.title, c.buyer_id, c.seller_id, c.updated_at
		FROM conversations c
		JOIN items i ON i.id = c.item_id
		WHERE c.buyer_id = ? OR c.seller_id = ?
		ORDER BY c.updated_at DESC`, u.ID, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load conversations")
		return
	}
	defer rows.Close()

	conversations := []conversation{}
	for rows.Next() {
		var c conversation
		if err := rows.Scan(&c.ID, &c.ItemID, &c.ItemTitle, &c.BuyerID, &c.SellerID, &c.UpdatedAt); err != nil {
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
	text, err := a.callGemini(r.Context(), prompt)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	a.saveAI(r.Context(), u.ID, nil, "description", prompt, text)
	writeJSON(w, http.StatusOK, map[string]string{"description": text})
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
	text, err := a.callGemini(r.Context(), prompt)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	a.saveAI(r.Context(), u.ID, &req.ItemID, "question", prompt, text)
	writeJSON(w, http.StatusOK, map[string]string{"answer": text})
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

func (a *app) saveAI(ctx context.Context, userID int64, itemID *int64, kind string, prompt string, result string) {
	_, _ = a.dbHandle().ExecContext(ctx,
		"INSERT INTO ai_generations (user_id, item_id, kind, prompt, result) VALUES (?, ?, ?, ?, ?)",
		userID, itemID, kind, prompt, result,
	)
}

func (a *app) callGemini(ctx context.Context, prompt string) (string, error) {
	if a.geminiKey == "" {
		return "", errors.New("GEMINI_API_KEY is not set")
	}
	body := map[string]any{
		"contents": []map[string]any{
			{"parts": []map[string]string{{"text": prompt}}},
		},
	}
	payload, _ := json.Marshal(body)
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", a.geminiModel, a.geminiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	resBody, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("gemini api error: %s", string(resBody))
	}

	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return "", errors.New("gemini returned empty response")
	}
	return strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text), nil
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

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
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
