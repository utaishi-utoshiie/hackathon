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
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"os/exec"
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
	ID                int64     `json:"id"`
	SellerID          int64     `json:"sellerId"`
	SellerName        string    `json:"sellerName"`
	SellerRatingAvg   float64   `json:"sellerRatingAvg"`
	SellerReviewCount int       `json:"sellerReviewCount"`
	Title             string    `json:"title"`
	Description       string    `json:"description"`
	Category          string    `json:"category"`
	Price             int       `json:"price"`
	MinPrice          int       `json:"minPrice"`
	AIPersonality     string    `json:"aiPersonality"`
	IsBarter          bool      `json:"isBarter"`
	WantedCategory    string    `json:"wantedCategory"`
	Status            string    `json:"status"`
	ImageURL          string    `json:"imageUrl"`
	LikeCount         int       `json:"likeCount"`
	CreatedAt         time.Time `json:"createdAt"`
}

type userReview struct {
	ID           int64     `json:"id"`
	PurchaseID   int64     `json:"purchaseId"`
	ItemID       int64     `json:"itemId"`
	ItemTitle    string    `json:"itemTitle"`
	ReviewerID   int64     `json:"reviewerId"`
	ReviewerName string    `json:"reviewerName"`
	RevieweeID   int64     `json:"revieweeId"`
	RevieweeName string    `json:"revieweeName"`
	Rating       int       `json:"rating"`
	Comment      string    `json:"comment"`
	CreatedAt    time.Time `json:"createdAt"`
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

type itemScene struct {
	ImageURL   string    `json:"imageUrl"`
	Prompt     string    `json:"prompt"`
	CreatedAt  time.Time `json:"createdAt"`
	IsPersonal bool      `json:"isPersonal"`
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

type imageUpload struct {
	Filename    string
	ContentType string
	Bytes       []byte
}

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
	mux.HandleFunc("PUT /api/local-upload", a.localUpload)
	mux.HandleFunc("POST /api/auth/register", a.register)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/profile", a.requireAuth(a.updateProfile))
	mux.HandleFunc("GET /api/items", a.listItems)
	mux.HandleFunc("GET /api/my/items", a.requireAuth(a.listMyItems))
	mux.HandleFunc("GET /api/my/stats", a.requireAuth(a.getMyStats))
	mux.HandleFunc("POST /api/items", a.requireAuth(a.createItem))
	mux.HandleFunc("POST /api/upload", a.requireAuth(a.createUploadURL))
	mux.HandleFunc("GET /api/items/{id}/ai-scene", a.requireAuth(a.getLatestItemScene))
	mux.HandleFunc("POST /api/items/{id}/ai-scene", a.requireAuth(a.generateItemScene))
	mux.HandleFunc("GET /api/items/{id}", a.getItem)
	mux.HandleFunc("POST /api/items/{id}/cancel", a.requireAuth(a.cancelItem))
	mux.HandleFunc("POST /api/items/{id}/like", a.requireAuth(a.toggleLike))
	mux.HandleFunc("POST /api/items/{id}/purchase", a.requireAuth(a.purchaseItem))
	mux.HandleFunc("GET /api/items/{id}/reviews", a.listItemReviews)
	mux.HandleFunc("POST /api/items/{id}/reviews", a.requireAuth(a.createUserReview))
	mux.HandleFunc("GET /api/users/{id}/reviews", a.listUserReviews)
	mux.HandleFunc("GET /api/conversations", a.requireAuth(a.listConversations))
	mux.HandleFunc("POST /api/conversations", a.requireAuth(a.createConversation))
	mux.HandleFunc("GET /api/conversations/{id}/messages", a.requireAuth(a.listMessages))
	mux.HandleFunc("POST /api/conversations/{id}/messages", a.requireAuth(a.createMessage))
	mux.HandleFunc("POST /api/ai/generate-description", a.requireAuth(a.generateDescription))
	mux.HandleFunc("POST /api/ai/ask", a.requireAuth(a.askAI))
	mux.HandleFunc("POST /api/ai/suggest-price", a.requireAuth(a.suggestPrice))

	// Negotiation Routes
	mux.HandleFunc("POST /api/items/{id}/negotiate", a.requireAuth(a.negotiateItem))

	// Barter Loop Routes
	mux.HandleFunc("GET /api/barter/loops", a.requireAuth(a.listBarterLoops))
	mux.HandleFunc("POST /api/barter/loops/{id}/accept", a.requireAuth(a.acceptBarterLoop))
	mux.HandleFunc("POST /api/barter/loops/{id}/ship", a.requireAuth(a.shipBarterLoop))
	mux.HandleFunc("POST /api/barter/loops/{id}/receive", a.requireAuth(a.receiveBarterLoop))

	// AI Video Route
	mux.HandleFunc("POST /api/items/{id}/ai-video", a.requireAuth(a.generateSceneVideo))

	// Admin Dashboard Routes
	mux.HandleFunc("GET /api/admin/stats", a.requireAdmin(a.getAdminStats))
	mux.HandleFunc("GET /api/admin/moderations", a.requireAdmin(a.getAdminModerations))
	mux.HandleFunc("GET /api/admin/users", a.requireAdmin(a.getAdminUsers))
	mux.HandleFunc("PUT /api/admin/users/{id}/role", a.requireAdmin(a.updateUserRole))

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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
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
	uploadServer := http.StripPrefix("/uploads/", http.FileServer(http.Dir(localUploadRoot())))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			api.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/uploads/") {
			uploadServer.ServeHTTP(w, r)
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
		if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/healthz" || r.URL.Path == "/api/local-upload" {
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
		Name       string `json:"name"`
		AvatarURL  string `json:"avatarUrl"`
		AvatarPath string `json:"avatarPath"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = u.Name
	}
	avatarValue := strings.TrimSpace(req.AvatarPath)
	if avatarValue == "" {
		avatarValue = strings.TrimSpace(req.AvatarURL)
	}
	if _, err := a.dbHandle().ExecContext(r.Context(), "UPDATE users SET name = ?, avatar_url = ? WHERE id = ?", name, avatarValue, u.ID); err != nil {
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
		SELECT i.id, i.seller_id, u.name,
		       COALESCE((SELECT AVG(rating) FROM user_reviews WHERE reviewee_id = i.seller_id), 0),
		       (SELECT COUNT(*) FROM user_reviews WHERE reviewee_id = i.seller_id),
		       i.title, i.description, i.category, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       COUNT(DISTINCT l.user_id), i.created_at
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
		if err := rows.Scan(&it.ID, &it.SellerID, &it.SellerName, &it.SellerRatingAvg, &it.SellerReviewCount, &it.Title, &it.Description, &it.Category, &it.Price, &it.Status, &it.ImageURL, &it.LikeCount, &it.CreatedAt); err != nil {
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
		SELECT i.id, i.seller_id, usr.name,
		       COALESCE((SELECT AVG(rating) FROM user_reviews WHERE reviewee_id = i.seller_id), 0),
		       (SELECT COUNT(*) FROM user_reviews WHERE reviewee_id = i.seller_id),
		       i.title, i.description, i.category, i.price, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       COUNT(DISTINCT l.user_id), i.created_at
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
		if err := rows.Scan(&it.ID, &it.SellerID, &it.SellerName, &it.SellerRatingAvg, &it.SellerReviewCount, &it.Title, &it.Description, &it.Category, &it.Price, &it.Status, &it.ImageURL, &it.LikeCount, &it.CreatedAt); err != nil {
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
		Purpose     string `json:"purpose"`
		Visibility  string `json:"visibility"`
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

	prefix := uploadPrefix(req.Purpose)
	privateUpload := strings.EqualFold(strings.TrimSpace(req.Visibility), "private") || strings.EqualFold(strings.TrimSpace(req.Purpose), "avatar")
	signed, publicURL, objectPath, err := signedGCSUploadURL(prefix, req.Filename, req.ContentType)
	if err != nil {
		if !missingGCSConfig() {
			writeError(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		signed, publicURL, objectPath, err = a.localUploadURL(r, prefix, req.Filename, req.ContentType)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "ローカル画像アップロードURLの発行に失敗しました")
			return
		}
	}
	viewURL := publicURL
	if privateUpload {
		viewURL = ""
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"uploadUrl":   signed,
		"publicUrl":   viewURL,
		"objectPath":  objectPath,
		"method":      http.MethodPut,
		"contentType": req.ContentType,
	})
}

func (a *app) localUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	claim, err := a.verifyLocalUploadToken(token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid upload token")
		return
	}
	if contentType := r.Header.Get("Content-Type"); contentType != "" && contentType != claim.ContentType {
		writeError(w, http.StatusBadRequest, "content type does not match signed upload")
		return
	}

	target := filepath.Join(localUploadRoot(), claim.Path)
	if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(localUploadRoot())) {
		writeError(w, http.StatusBadRequest, "invalid upload path")
		return
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to prepare upload directory")
		return
	}
	file, err := os.Create(target)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create upload file")
		return
	}
	defer file.Close()
	if _, err := io.Copy(file, http.MaxBytesReader(w, r.Body, 12<<20)); err != nil {
		writeError(w, http.StatusBadRequest, "failed to save upload")
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
		Title          string `json:"title"`
		Description    string `json:"description"`
		Category       string `json:"category"`
		Price          int    `json:"price"`
		MinPrice       int    `json:"minPrice"`
		AIPersonality  string `json:"aiPersonality"`
		IsBarter       bool   `json:"isBarter"`
		WantedCategory string `json:"wantedCategory"`
		ImageURL       string `json:"imageUrl"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title == "" || req.Description == "" || req.Category == "" || req.Price <= 0 {
		writeError(w, http.StatusBadRequest, "title, description, category, and positive price are required")
		return
	}
	if req.MinPrice <= 0 {
		req.MinPrice = req.Price
	}
	if req.MinPrice > req.Price {
		writeError(w, http.StatusBadRequest, "minimum price cannot exceed original price")
		return
	}
	if req.AIPersonality == "" {
		req.AIPersonality = "standard"
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
		"INSERT INTO items (seller_id, title, description, category, price, min_price, ai_personality, is_barter, wanted_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		u.ID, req.Title, req.Description, req.Category, req.Price, req.MinPrice, req.AIPersonality, req.IsBarter, req.WantedCategory,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create item: "+err.Error())
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

func (a *app) getLatestItemScene(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}
	scene, found, err := a.findLatestItemScene(r.Context(), u.ID, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load generated scene")
		return
	}
	if !found {
		writeJSON(w, http.StatusOK, map[string]any{"scene": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"scene": scene})
}

func (a *app) generateItemScene(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}
	storedUser, rawAvatarRef, err := a.findUserByIDRaw(r.Context(), u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load profile")
		return
	}
	if strings.TrimSpace(rawAvatarRef) == "" {
		writeError(w, http.StatusBadRequest, "プロフィール写真を先に登録してください")
		return
	}

	it, err := a.findItem(r.Context(), itemID)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if strings.TrimSpace(it.ImageURL) == "" {
		writeError(w, http.StatusBadRequest, "元の商品画像がないためAI画像を生成できません")
		return
	}

	avatarBytes, avatarType, err := a.downloadImageAsset(r.Context(), rawAvatarRef)
	if err != nil {
		writeError(w, http.StatusBadGateway, "プロフィール写真を読み込めませんでした")
		return
	}
	itemBytes, itemType, err := a.downloadImageAsset(r.Context(), it.ImageURL)
	if err != nil {
		writeError(w, http.StatusBadGateway, "商品画像を読み込めませんでした")
		return
	}

	prompt := itemScenePrompt(storedUser.Name, it)
	generatedBytes, err := a.callOpenAIImageEdit(r.Context(), prompt, []imageUpload{
		{Filename: "avatar.jpg", ContentType: avatarType, Bytes: avatarBytes},
		{Filename: "item.jpg", ContentType: itemType, Bytes: itemBytes},
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	objectPath, sceneURL, err := saveGeneratedImageToGCS("generated-scenes", fmt.Sprintf("item-%d-user-%d.jpeg", itemID, u.ID), "image/jpeg", generatedBytes)
	if err != nil {
		writeError(w, http.StatusBadGateway, "AI画像の保存に失敗しました")
		return
	}
	if _, err := a.dbHandle().ExecContext(r.Context(),
		"INSERT INTO item_scene_generations (user_id, item_id, image_path, prompt) VALUES (?, ?, ?, ?)",
		u.ID, itemID, objectPath, prompt,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "generated scene could not be recorded")
		return
	}

	a.saveAI(r.Context(), u.ID, &itemID, "item_scene", prompt, objectPath)
	writeJSON(w, http.StatusCreated, map[string]any{
		"scene": itemScene{
			ImageURL:   sceneURL,
			Prompt:     prompt,
			CreatedAt:  time.Now().UTC(),
			IsPersonal: true,
		},
	})
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

func (a *app) createUserReview(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Comment = strings.TrimSpace(req.Comment)
	if req.Rating < 1 || req.Rating > 5 || req.Comment == "" {
		writeError(w, http.StatusBadRequest, "rating between 1 and 5 and comment are required")
		return
	}

	var purchaseID, buyerID, sellerID int64
	err := a.dbHandle().QueryRowContext(r.Context(), `
		SELECT id, buyer_id, seller_id
		FROM purchases
		WHERE item_id = ? AND status = 'completed'
		ORDER BY created_at DESC
		LIMIT 1`, itemID,
	).Scan(&purchaseID, &buyerID, &sellerID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "completed purchase not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load purchase")
		return
	}

	var revieweeID int64
	switch u.ID {
	case buyerID:
		revieweeID = sellerID
	case sellerID:
		revieweeID = buyerID
	default:
		writeError(w, http.StatusForbidden, "only buyer or seller can review this transaction")
		return
	}

	res, err := a.dbHandle().ExecContext(r.Context(), `
		INSERT INTO user_reviews (purchase_id, item_id, reviewer_id, reviewee_id, rating, comment)
		VALUES (?, ?, ?, ?, ?, ?)`,
		purchaseID, itemID, u.ID, revieweeID, req.Rating, req.Comment,
	)
	if err != nil {
		writeError(w, http.StatusConflict, "you have already reviewed this transaction")
		return
	}
	reviewID, _ := res.LastInsertId()
	review, err := a.findUserReview(r.Context(), reviewID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load review")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"review": review})
}

func (a *app) listItemReviews(w http.ResponseWriter, r *http.Request) {
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}
	reviews, err := a.queryReviews(r.Context(), "ur.item_id = ?", itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load reviews")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reviews": reviews})
}

func (a *app) listUserReviews(w http.ResponseWriter, r *http.Request) {
	userID, ok := pathID(w, r)
	if !ok {
		return
	}
	reviews, err := a.queryReviews(r.Context(), "ur.reviewee_id = ?", userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load reviews")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reviews": reviews})
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
		       '' AS counterpart_avatar_url,
		       c.updated_at
		FROM conversations c
		JOIN items i ON i.id = c.item_id
		JOIN users buyer ON buyer.id = c.buyer_id
		JOIN users seller ON seller.id = c.seller_id
		WHERE c.buyer_id = ? OR c.seller_id = ?
		ORDER BY c.updated_at DESC`, u.ID, u.ID, u.ID, u.ID)
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
		SELECT i.id, i.seller_id, u.name,
		       COALESCE((SELECT AVG(rating) FROM user_reviews WHERE reviewee_id = i.seller_id), 0),
		       (SELECT COUNT(*) FROM user_reviews WHERE reviewee_id = i.seller_id),
		       i.title, i.description, i.category, i.price, i.min_price, i.ai_personality, i.is_barter, i.wanted_category, i.status,
		       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
		       (SELECT COUNT(*) FROM likes WHERE item_id = i.id), i.created_at
		FROM items i
		JOIN users u ON u.id = i.seller_id
		WHERE i.id = ?`, id,
	).Scan(&it.ID, &it.SellerID, &it.SellerName, &it.SellerRatingAvg, &it.SellerReviewCount, &it.Title, &it.Description, &it.Category, &it.Price, &it.MinPrice, &it.AIPersonality, &it.IsBarter, &it.WantedCategory, &it.Status, &it.ImageURL, &it.LikeCount, &it.CreatedAt)
	return it, err
}

func (a *app) findUserReview(ctx context.Context, id int64) (userReview, error) {
	reviews, err := a.queryReviews(ctx, "ur.id = ?", id)
	if err != nil {
		return userReview{}, err
	}
	if len(reviews) == 0 {
		return userReview{}, sql.ErrNoRows
	}
	return reviews[0], nil
}

func (a *app) queryReviews(ctx context.Context, condition string, args ...any) ([]userReview, error) {
	rows, err := a.dbHandle().QueryContext(ctx, `
		SELECT ur.id, ur.purchase_id, ur.item_id, i.title,
		       ur.reviewer_id, reviewer.name,
		       ur.reviewee_id, reviewee.name,
		       ur.rating, ur.comment, ur.created_at
		FROM user_reviews ur
		JOIN items i ON i.id = ur.item_id
		JOIN users reviewer ON reviewer.id = ur.reviewer_id
		JOIN users reviewee ON reviewee.id = ur.reviewee_id
		WHERE `+condition+`
		ORDER BY ur.created_at DESC
		LIMIT 50`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reviews := []userReview{}
	for rows.Next() {
		var review userReview
		if err := rows.Scan(
			&review.ID, &review.PurchaseID, &review.ItemID, &review.ItemTitle,
			&review.ReviewerID, &review.ReviewerName,
			&review.RevieweeID, &review.RevieweeName,
			&review.Rating, &review.Comment, &review.CreatedAt,
		); err != nil {
			return nil, err
		}
		reviews = append(reviews, review)
	}
	return reviews, rows.Err()
}

func (a *app) findUserByID(ctx context.Context, id int64) (user, error) {
	u, avatarRef, err := a.findUserByIDRaw(ctx, id)
	if err != nil {
		return user{}, err
	}
	u.AvatarURL = assetViewURL(avatarRef)
	return u, nil
}

func (a *app) findUserByIDRaw(ctx context.Context, id int64) (user, string, error) {
	var u user
	var avatarRef string
	err := a.dbHandle().QueryRowContext(ctx,
		"SELECT id, name, email, role, COALESCE(avatar_url, '') FROM users WHERE id = ?",
		id,
	).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &avatarRef)
	return u, avatarRef, err
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

func (a *app) callOpenAIImageEdit(ctx context.Context, prompt string, images []imageUpload) ([]byte, error) {
	if a.openAIKey == "" {
		return nil, errors.New("OPENAI_API_KEY is not set")
	}
	endpoint, err := url.JoinPath(a.openAIBaseURL, "/v1/images/edits")
	if err != nil {
		return nil, err
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("model", "gpt-image-1.5")
	_ = writer.WriteField("prompt", prompt)
	_ = writer.WriteField("input_fidelity", "high")
	_ = writer.WriteField("quality", "high")
	_ = writer.WriteField("size", "1536x1024")
	_ = writer.WriteField("output_format", "jpeg")
	for _, image := range images {
		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="image[]"; filename="%s"`, strings.ReplaceAll(image.Filename, "\"", "\\\"")))
		contentType := image.ContentType
		if contentType == "" {
			contentType = "image/jpeg"
		}
		h.Set("Content-Type", contentType)

		part, err := writer.CreatePart(h)
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(image.Bytes); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+a.openAIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("openai image api error: %s", string(respBody))
	}

	var parsed struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, err
	}
	if len(parsed.Data) == 0 || parsed.Data[0].B64JSON == "" {
		return nil, errors.New("openai returned empty image")
	}
	return base64.StdEncoding.DecodeString(parsed.Data[0].B64JSON)
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

func itemScenePrompt(userName string, it item) string {
	return fmt.Sprintf(`与えられた2枚の画像を元に、リアルな商品使用シーン写真を1枚だけ生成してください。
1枚目はユーザー本人の顔写真、2枚目は商品画像です。
商品そのものの形・素材・色をできる限り維持し、本人が自然にその商品を使っている実写風の写真にしてください。
不自然な合成感、別人化、過度な美化、漫画風表現は避けてください。
背景は日常的で自然な場所にしてください。
商品名: %s
カテゴリ: %s
価格: %d円
説明: %s
利用者名: %s`, it.Title, it.Category, it.Price, it.Description, userName)
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
		"sub":       u.ID,
		"name":      u.Name,
		"email":     u.Email,
		"role":      u.Role,
		"avatarUrl": u.AvatarURL,
		"exp":       time.Now().Add(24 * time.Hour).Unix(),
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
		Sub       int64  `json:"sub"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		Role      string `json:"role"`
		AvatarURL string `json:"avatarUrl"`
		Exp       int64  `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return user{}, err
	}
	if time.Now().Unix() > claims.Exp {
		return user{}, errors.New("token expired")
	}
	return user{ID: claims.Sub, Name: claims.Name, Email: claims.Email, Role: claims.Role, AvatarURL: claims.AvatarURL}, nil
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
	if err := ensureColumn(ctx, db, "users", "avatar_url", "ALTER TABLE users ADD COLUMN avatar_url TEXT NULL AFTER role"); err != nil {
		return err
	}
	if err := ensureTable(ctx, db, `CREATE TABLE IF NOT EXISTS item_scene_generations (
		id BIGINT PRIMARY KEY AUTO_INCREMENT,
		user_id BIGINT NOT NULL,
		item_id BIGINT NOT NULL,
		image_path TEXT NOT NULL,
		prompt TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		INDEX idx_item_scene_generations_user_item_created_at (user_id, item_id, created_at),
		CONSTRAINT fk_item_scene_generations_user FOREIGN KEY (user_id) REFERENCES users(id),
		CONSTRAINT fk_item_scene_generations_item FOREIGN KEY (item_id) REFERENCES items(id)
	)`); err != nil {
		return err
	}

	if err := ensureColumn(ctx, db, "item_scene_generations", "video_path", "ALTER TABLE item_scene_generations ADD COLUMN video_path TEXT NULL AFTER image_path"); err != nil {
		return err
	}

	if err := ensureColumn(ctx, db, "items", "min_price", "ALTER TABLE items ADD COLUMN min_price INT NOT NULL DEFAULT 0 AFTER price"); err != nil {
		return err
	}
	if err := ensureColumn(ctx, db, "items", "ai_personality", "ALTER TABLE items ADD COLUMN ai_personality VARCHAR(50) NOT NULL DEFAULT 'standard' AFTER min_price"); err != nil {
		return err
	}
	if err := ensureTable(ctx, db, `CREATE TABLE IF NOT EXISTS negotiations (
		id BIGINT PRIMARY KEY AUTO_INCREMENT,
		item_id BIGINT NOT NULL,
		buyer_id BIGINT NOT NULL,
		seller_id BIGINT NOT NULL,
		buyer_budget INT NOT NULL,
		desire_level VARCHAR(20) NOT NULL,
		agreed_price INT NOT NULL,
		status VARCHAR(30) NOT NULL DEFAULT 'pending',
		negotiation_log TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		CONSTRAINT fk_negotiations_item FOREIGN KEY (item_id) REFERENCES items(id),
		CONSTRAINT fk_negotiations_buyer FOREIGN KEY (buyer_id) REFERENCES users(id),
		CONSTRAINT fk_negotiations_seller FOREIGN KEY (seller_id) REFERENCES users(id)
	)`); err != nil {
		return err
	}

	if err := ensureIndex(ctx, db, "purchases", "idx_purchases_seller_created_at_price", "ALTER TABLE purchases ADD INDEX idx_purchases_seller_created_at_price (seller_id, created_at, price)"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "items", "idx_items_seller_status_created_at", "ALTER TABLE items ADD INDEX idx_items_seller_status_created_at (seller_id, status, created_at)"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "negotiations", "idx_negotiations_item_created_at", "ALTER TABLE negotiations ADD INDEX idx_negotiations_item_created_at (item_id, created_at)"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "negotiations", "idx_negotiations_buyer_created_at", "ALTER TABLE negotiations ADD INDEX idx_negotiations_buyer_created_at (buyer_id, created_at)"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "negotiations", "idx_negotiations_seller_created_at", "ALTER TABLE negotiations ADD INDEX idx_negotiations_seller_created_at (seller_id, created_at)"); err != nil {
		return err
	}

	// Barter Loop columns and tables
	if err := ensureColumn(ctx, db, "items", "is_barter", "ALTER TABLE items ADD COLUMN is_barter BOOLEAN NOT NULL DEFAULT FALSE AFTER ai_personality"); err != nil {
		return err
	}
	if err := ensureColumn(ctx, db, "items", "wanted_category", "ALTER TABLE items ADD COLUMN wanted_category VARCHAR(80) NOT NULL DEFAULT '' AFTER is_barter"); err != nil {
		return err
	}
	if err := ensureTable(ctx, db, `CREATE TABLE IF NOT EXISTS barter_loops (
		id BIGINT PRIMARY KEY AUTO_INCREMENT,
		status VARCHAR(30) NOT NULL DEFAULT 'proposal',
		justification TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return err
	}
	if err := ensureTable(ctx, db, `CREATE TABLE IF NOT EXISTS barter_loop_members (
		id BIGINT PRIMARY KEY AUTO_INCREMENT,
		loop_id BIGINT NOT NULL,
		item_id BIGINT NOT NULL,
		sender_id BIGINT NOT NULL,
		receiver_id BIGINT NOT NULL,
		estimated_value INT NOT NULL,
		cash_adjustment INT NOT NULL,
		accepted BOOLEAN NOT NULL DEFAULT FALSE,
		shipping_status VARCHAR(30) NOT NULL DEFAULT 'pending',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		CONSTRAINT fk_loop_members_loop FOREIGN KEY (loop_id) REFERENCES barter_loops(id),
		CONSTRAINT fk_loop_members_item FOREIGN KEY (item_id) REFERENCES items(id),
		CONSTRAINT fk_loop_members_sender FOREIGN KEY (sender_id) REFERENCES users(id),
		CONSTRAINT fk_loop_members_receiver FOREIGN KEY (receiver_id) REFERENCES users(id)
	)`); err != nil {
		return err
	}

	if err := ensureIndex(ctx, db, "barter_loop_members", "idx_loop_members_loop_id", "ALTER TABLE barter_loop_members ADD INDEX idx_loop_members_loop_id (loop_id)"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "barter_loop_members", "idx_loop_members_sender_id", "ALTER TABLE barter_loop_members ADD INDEX idx_loop_members_sender_id (sender_id)"); err != nil {
		return err
	}
	return ensureIndex(ctx, db, "barter_loop_members", "idx_loop_members_receiver_id", "ALTER TABLE barter_loop_members ADD INDEX idx_loop_members_receiver_id (receiver_id)")
}

func ensureColumn(ctx context.Context, db *sql.DB, table string, column string, alterSQL string) error {
	var exists int
	err := db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
		table, column,
	).Scan(&exists)
	if err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}
	_, err = db.ExecContext(ctx, alterSQL)
	return err
}

func ensureTable(ctx context.Context, db *sql.DB, createSQL string) error {
	_, err := db.ExecContext(ctx, createSQL)
	return err
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

func signedGCSUploadURL(prefix string, filename string, contentType string) (string, string, string, error) {
	bucket := strings.TrimSpace(os.Getenv("GCS_BUCKET"))
	clientEmail := strings.TrimSpace(os.Getenv("GCS_CLIENT_EMAIL"))
	privateKeyText := strings.TrimSpace(os.Getenv("GCS_PRIVATE_KEY"))
	if bucket == "" || clientEmail == "" || privateKeyText == "" {
		return "", "", "", errors.New("画像アップロード設定が未設定です: GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY を設定してください")
	}

	privateKey, err := parseRSAPrivateKey(privateKeyText)
	if err != nil {
		return "", "", "", errors.New("GCS_PRIVATE_KEY を読み込めませんでした")
	}

	now := time.Now().UTC()
	datestamp := now.Format("20060102")
	timestamp := now.Format("20060102T150405Z")
	objectName := fmt.Sprintf("%s/%s-%s", prefix, now.Format("20060102150405"), sanitizeObjectName(filename))
	credentialScope := datestamp + "/auto/storage/goog4_request"
	credential := clientEmail + "/" + credentialScope
	expires := "900"
	canonicalURI := gcsPathStyleURI(bucket, objectName)

	query := url.Values{}
	query.Set("X-Goog-Algorithm", "GOOG4-RSA-SHA256")
	query.Set("X-Goog-Credential", credential)
	query.Set("X-Goog-Date", timestamp)
	query.Set("X-Goog-Expires", expires)
	query.Set("X-Goog-SignedHeaders", "content-type;host")

	canonicalRequest := strings.Join([]string{
		http.MethodPut,
		canonicalURI,
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
		return "", "", "", errors.New("署名付きURLの発行に失敗しました")
	}
	query.Set("X-Goog-Signature", hex.EncodeToString(signatureBytes))

	publicURL := gcsPathStyleURL(bucket, objectName)
	uploadURL := publicURL + "?" + query.Encode()
	return uploadURL, publicURL, "gcs://" + bucket + "/" + objectName, nil
}

type localUploadClaim struct {
	Path        string `json:"path"`
	ContentType string `json:"contentType"`
	Exp         int64  `json:"exp"`
}

func (a *app) localUploadURL(r *http.Request, prefix string, filename string, contentType string) (string, string, string, error) {
	objectName := fmt.Sprintf("%s/%s-%s", prefix, time.Now().UTC().Format("20060102150405"), sanitizeObjectName(filename))
	claim := localUploadClaim{
		Path:        objectName,
		ContentType: contentType,
		Exp:         time.Now().Add(15 * time.Minute).Unix(),
	}
	token, err := a.signLocalUploadToken(claim)
	if err != nil {
		return "", "", "", err
	}
	base := requestBaseURL(r)
	uploadURL := base + "/api/local-upload?token=" + url.QueryEscape(token)
	publicURL := base + "/uploads/" + escapeObjectPath(objectName)
	return uploadURL, publicURL, "local://" + objectName, nil
}

func (a *app) signLocalUploadToken(claim localUploadClaim) (string, error) {
	body, err := json.Marshal(claim)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(body)
	return payload + "." + hmacSHA256(payload, a.jwtSecret), nil
}

func (a *app) verifyLocalUploadToken(token string) (localUploadClaim, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return localUploadClaim{}, errors.New("invalid token")
	}
	expected := hmacSHA256(parts[0], a.jwtSecret)
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return localUploadClaim{}, errors.New("invalid signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return localUploadClaim{}, err
	}
	var claim localUploadClaim
	if err := json.Unmarshal(payload, &claim); err != nil {
		return localUploadClaim{}, err
	}
	if time.Now().Unix() > claim.Exp {
		return localUploadClaim{}, errors.New("token expired")
	}
	cleanPath := filepath.Clean(claim.Path)
	if strings.HasPrefix(cleanPath, "..") || strings.HasPrefix(cleanPath, "/") {
		return localUploadClaim{}, errors.New("invalid path")
	}
	claim.Path = cleanPath
	return claim, nil
}

func missingGCSConfig() bool {
	return strings.TrimSpace(os.Getenv("GCS_BUCKET")) == "" ||
		strings.TrimSpace(os.Getenv("GCS_CLIENT_EMAIL")) == "" ||
		strings.TrimSpace(os.Getenv("GCS_PRIVATE_KEY")) == ""
}

func localUploadRoot() string {
	return filepath.Join(".", "uploads")
}

func requestBaseURL(r *http.Request) string {
	if base := strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/"); base != "" {
		return base
	}
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := r.Host
	if forwardedHost := r.Header.Get("X-Forwarded-Host"); forwardedHost != "" {
		host = forwardedHost
	}
	return scheme + "://" + host
}

func uploadPrefix(purpose string) string {
	switch strings.ToLower(strings.TrimSpace(purpose)) {
	case "avatar", "avatars", "profile":
		return "avatars"
	case "generated", "scene", "ai-scene":
		return "generated-scenes"
	default:
		return "items"
	}
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

func gcsPathStyleURI(bucket string, objectName string) string {
	return "/" + url.PathEscape(bucket) + "/" + escapeObjectPath(objectName)
}

func gcsPathStyleURL(bucket string, objectName string) string {
	return "https://storage.googleapis.com" + gcsPathStyleURI(bucket, objectName)
}

func assetViewURL(ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return ""
	}
	if strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") {
		return ref
	}
	if strings.HasPrefix(ref, "local://") {
		return strings.TrimRight(env("PUBLIC_BASE_URL", "http://localhost:8080"), "/") + "/uploads/" + escapeObjectPath(strings.TrimPrefix(ref, "local://"))
	}
	if strings.HasPrefix(ref, "gcs://") {
		signed, err := signedGCSReadURL(ref, 15*time.Minute)
		if err == nil {
			return signed
		}
	}
	return ""
}

func signedGCSReadURL(ref string, ttl time.Duration) (string, error) {
	bucket, objectName, err := parseGCSRef(ref)
	if err != nil {
		return "", err
	}
	clientEmail := strings.TrimSpace(os.Getenv("GCS_CLIENT_EMAIL"))
	privateKeyText := strings.TrimSpace(os.Getenv("GCS_PRIVATE_KEY"))
	if clientEmail == "" || privateKeyText == "" {
		return "", errors.New("missing GCS signing credentials")
	}
	privateKey, err := parseRSAPrivateKey(privateKeyText)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	datestamp := now.Format("20060102")
	timestamp := now.Format("20060102T150405Z")
	credentialScope := datestamp + "/auto/storage/goog4_request"
	credential := clientEmail + "/" + credentialScope
	canonicalURI := gcsPathStyleURI(bucket, objectName)
	query := url.Values{}
	query.Set("X-Goog-Algorithm", "GOOG4-RSA-SHA256")
	query.Set("X-Goog-Credential", credential)
	query.Set("X-Goog-Date", timestamp)
	query.Set("X-Goog-Expires", strconv.Itoa(int(ttl.Seconds())))
	query.Set("X-Goog-SignedHeaders", "host")

	canonicalRequest := strings.Join([]string{
		http.MethodGet,
		canonicalURI,
		query.Encode(),
		"host:storage.googleapis.com\n",
		"host",
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
		return "", err
	}
	query.Set("X-Goog-Signature", hex.EncodeToString(signatureBytes))
	return gcsPathStyleURL(bucket, objectName) + "?" + query.Encode(), nil
}

func parseGCSRef(ref string) (string, string, error) {
	if !strings.HasPrefix(ref, "gcs://") {
		return "", "", errors.New("unsupported gcs ref")
	}
	trimmed := strings.TrimPrefix(ref, "gcs://")
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", errors.New("invalid gcs ref")
	}
	return parts[0], parts[1], nil
}

func saveGeneratedImageToGCS(prefix string, filename string, contentType string, data []byte) (string, string, error) {
	uploadURL, _, objectPath, err := signedGCSUploadURL(prefix, filename, contentType)
	if err != nil {
		return "", "", err
	}
	req, err := http.NewRequest(http.MethodPut, uploadURL, bytes.NewReader(data))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", contentType)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", "", fmt.Errorf("gcs upload failed: %s", string(body))
	}
	return objectPath, assetViewURL(objectPath), nil
}

func (a *app) findLatestItemScene(ctx context.Context, userID int64, itemID int64) (itemScene, bool, error) {
	var scene itemScene
	var imagePath string
	err := a.dbHandle().QueryRowContext(ctx,
		"SELECT image_path, prompt, created_at FROM item_scene_generations WHERE user_id = ? AND item_id = ? ORDER BY created_at DESC LIMIT 1",
		userID, itemID,
	).Scan(&imagePath, &scene.Prompt, &scene.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return itemScene{}, false, nil
	}
	if err != nil {
		return itemScene{}, false, err
	}
	scene.ImageURL = assetViewURL(imagePath)
	scene.IsPersonal = true
	return scene, true, nil
}

func (a *app) downloadImageAsset(ctx context.Context, ref string) ([]byte, string, error) {
	assetURL := ref
	if strings.HasPrefix(strings.TrimSpace(ref), "local://") {
		path := filepath.Join(localUploadRoot(), strings.TrimPrefix(ref, "local://"))
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, "", err
		}
		return data, http.DetectContentType(data), nil
	}
	if strings.HasPrefix(strings.TrimSpace(ref), "gcs://") {
		signed, err := signedGCSReadURL(ref, 15*time.Minute)
		if err != nil {
			return nil, "", err
		}
		assetURL = signed
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, assetURL, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("asset download failed with status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	if semi := strings.Index(contentType, ";"); semi >= 0 {
		contentType = strings.TrimSpace(contentType[:semi])
	}
	return data, contentType, nil
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

// Admin Dashboard Structs and Handlers

func (a *app) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return a.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		u := currentUser(r)
		if u.Role != "admin" {
			writeError(w, http.StatusForbidden, "forbidden: admin role required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type adminStatsSummary struct {
	TotalUsers        int64 `json:"totalUsers"`
	TotalItems        int64 `json:"totalItems"`
	TotalTransactions int64 `json:"totalTransactions"`
	TotalRevenue      int64 `json:"totalRevenue"`
}

type dailySignup struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type dailyTransaction struct {
	Date    string `json:"date"`
	TxCount int64  `json:"txCount"`
	Revenue int64  `json:"revenue"`
}

type categoryStat struct {
	Category   string `json:"category"`
	ItemCount  int64  `json:"itemCount"`
	TotalValue int64  `json:"totalValue"`
}

type adminStatsResponse struct {
	Summary              adminStatsSummary  `json:"summary"`
	DailySignups         []dailySignup      `json:"dailySignups"`
	DailyTransactions    []dailyTransaction `json:"dailyTransactions"`
	CategoryDistribution []categoryStat     `json:"categoryDistribution"`
}

func (a *app) getAdminStats(w http.ResponseWriter, r *http.Request) {
	db := a.dbHandle()
	if db == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	var totalUsers, totalItems, totalTransactions, totalRevenue int64

	// Total Users
	err := db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM users").Scan(&totalUsers)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get total users: "+err.Error())
		return
	}

	// Total Items
	err = db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM items").Scan(&totalItems)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get total items: "+err.Error())
		return
	}

	// Total Transactions & Revenue
	err = db.QueryRowContext(r.Context(), "SELECT COUNT(*), COALESCE(SUM(price), 0) FROM purchases WHERE status = 'completed'").Scan(&totalTransactions, &totalRevenue)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get purchase stats: "+err.Error())
		return
	}

	// Daily Signups (Last 30 days)
	rows, err := db.QueryContext(r.Context(), `
		SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as dt, COUNT(*)
		FROM users
		WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
		GROUP BY dt
		ORDER BY dt ASC
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get daily signups: "+err.Error())
		return
	}
	defer rows.Close()

	dailySignups := []dailySignup{}
	for rows.Next() {
		var ds dailySignup
		if err := rows.Scan(&ds.Date, &ds.Count); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan daily signups: "+err.Error())
			return
		}
		dailySignups = append(dailySignups, ds)
	}

	// Daily Transactions & Revenue (Last 30 days)
	rowsTx, err := db.QueryContext(r.Context(), `
		SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as dt, COUNT(*), COALESCE(SUM(price), 0)
		FROM purchases
		WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND status = 'completed'
		GROUP BY dt
		ORDER BY dt ASC
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get daily transactions: "+err.Error())
		return
	}
	defer rowsTx.Close()

	dailyTransactions := []dailyTransaction{}
	for rowsTx.Next() {
		var dt dailyTransaction
		if err := rowsTx.Scan(&dt.Date, &dt.TxCount, &dt.Revenue); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan daily transactions: "+err.Error())
			return
		}
		dailyTransactions = append(dailyTransactions, dt)
	}

	// Category Distribution
	rowsCat, err := db.QueryContext(r.Context(), `
		SELECT category, COUNT(*), COALESCE(SUM(price), 0)
		FROM items
		GROUP BY category
		ORDER BY COUNT(*) DESC
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get category stats: "+err.Error())
		return
	}
	defer rowsCat.Close()

	categoryDistribution := []categoryStat{}
	for rowsCat.Next() {
		var cs categoryStat
		if err := rowsCat.Scan(&cs.Category, &cs.ItemCount, &cs.TotalValue); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan category stats: "+err.Error())
			return
		}
		categoryDistribution = append(categoryDistribution, cs)
	}

	res := adminStatsResponse{
		Summary: adminStatsSummary{
			TotalUsers:        totalUsers,
			TotalItems:        totalItems,
			TotalTransactions: totalTransactions,
			TotalRevenue:      totalRevenue,
		},
		DailySignups:         dailySignups,
		DailyTransactions:    dailyTransactions,
		CategoryDistribution: categoryDistribution,
	}

	writeJSON(w, http.StatusOK, res)
}

type adminModeration struct {
	ID              int64     `json:"id"`
	ItemID          int64     `json:"itemId"`
	ItemTitle       string    `json:"itemTitle"`
	UserID          int64     `json:"userId"`
	UserName        string    `json:"userName"`
	Prohibited      bool      `json:"prohibited"`
	RiskLevel       string    `json:"riskLevel"`
	Reasons         []string  `json:"reasons"`
	BlockedKeywords []string  `json:"blockedKeywords"`
	CreatedAt       time.Time `json:"createdAt"`
}

func splitClean(s string, sep string) []string {
	if s == "" {
		return []string{}
	}
	parts := strings.Split(s, sep)
	var res []string
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			res = append(res, trimmed)
		}
	}
	return res
}

func (a *app) getAdminModerations(w http.ResponseWriter, r *http.Request) {
	db := a.dbHandle()
	if db == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	rows, err := db.QueryContext(r.Context(), `
		SELECT im.id, im.item_id, i.title, im.user_id, u.name, im.prohibited, im.risk_level, im.reasons, im.blocked_keywords, im.created_at
		FROM item_moderations im
		JOIN items i ON im.item_id = i.id
		JOIN users u ON im.user_id = u.id
		ORDER BY im.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get moderations: "+err.Error())
		return
	}
	defer rows.Close()

	moderations := []adminModeration{}
	for rows.Next() {
		var m adminModeration
		var reasonsStr, keywordsStr string
		err := rows.Scan(
			&m.ID, &m.ItemID, &m.ItemTitle, &m.UserID, &m.UserName,
			&m.Prohibited, &m.RiskLevel, &reasonsStr, &keywordsStr, &m.CreatedAt,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan moderation: "+err.Error())
			return
		}
		m.Reasons = splitClean(reasonsStr, "\n")
		m.BlockedKeywords = splitClean(keywordsStr, ",")
		moderations = append(moderations, m)
	}

	writeJSON(w, http.StatusOK, map[string]any{"moderations": moderations})
}

type adminUser struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	AvatarURL string    `json:"avatarUrl"`
	CreatedAt time.Time `json:"createdAt"`
}

func (a *app) getAdminUsers(w http.ResponseWriter, r *http.Request) {
	db := a.dbHandle()
	if db == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	rows, err := db.QueryContext(r.Context(), `
		SELECT id, name, email, role, COALESCE(avatar_url, ''), created_at
		FROM users
		ORDER BY created_at DESC
		LIMIT 200
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get users: "+err.Error())
		return
	}
	defer rows.Close()

	users := []adminUser{}
	for rows.Next() {
		var u adminUser
		err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.AvatarURL, &u.CreatedAt)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan user: "+err.Error())
			return
		}
		users = append(users, u)
	}

	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (a *app) updateUserRole(w http.ResponseWriter, r *http.Request) {
	db := a.dbHandle()
	if db == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	userID, ok := pathID(w, r)
	if !ok {
		return
	}

	var req struct {
		Role string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Role != "user" && req.Role != "admin" {
		writeError(w, http.StatusBadRequest, "invalid role: must be user or admin")
		return
	}

	res, err := db.ExecContext(r.Context(), "UPDATE users SET role = ? WHERE id = ?", req.Role, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update user role: "+err.Error())
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	u, err := a.findUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load updated user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

// Negotiation Handlers and Helper Functions

func (a *app) negotiateItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	it, err := a.findItem(r.Context(), itemID)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	// SECURITY PROTECTION: Sanitize product title to prevent prompt injection inside AI bargaining loop
	cleanTitle := cleanForPrompt(it.Title)

	if it.Status != "active" {
		writeError(w, http.StatusConflict, "item is not active")
		return
	}

	if it.SellerID == u.ID {
		writeError(w, http.StatusBadRequest, "you cannot negotiate for your own item")
		return
	}

	var req struct {
		BuyerBudget int    `json:"buyerBudget"`
		DesireLevel string `json:"desireLevel"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.BuyerBudget <= 0 {
		writeError(w, http.StatusBadRequest, "valid buyer budget is required")
		return
	}
	if req.DesireLevel != "low" && req.DesireLevel != "medium" && req.DesireLevel != "high" {
		req.DesireLevel = "medium"
	}

	// 6-turn loop of back-and-forth LLM-driven negotiation
	var history []map[string]any
	var agreedPrice int
	var status = "failed"

	for turn := 1; turn <= 6; turn++ {
		var prompt string
		var speaker string
		if turn%2 == 1 {
			speaker = "buyer"
			prompt = fmt.Sprintf(`あなたは購入者の代理交渉AIエージェントです。性格は「標準（丁寧）」です。
現在の取引対象：
商品名: "%s"
出品価格: %d円

あなたの交渉設定：
希望購入予算: %d円
欲しい度（購入意欲）: %s (low/medium/high)

ルール：
1. 予算内での購入を目指しますが、欲しい度が「high」の場合は予算の1.1倍まで、それ以外は予算の1.05倍まで引き上げを許容します。
2. これまでの交渉履歴は以下の通りです：
%s

これまでの履歴を踏まえ、キャラクターを演じて次のターンに発言してください。
もし相手（出品者）の最後の提示価格が、あなたの許容範囲内（許容上限以下）であれば、アクションを "accept" にし、その価格を受け入れてください。相手が不当に高額であったり、絶対に予算に近づく余地がなければ、アクション "reject" にしてください。
それ以外（さらに値引きを要求する場合）はアクション "offer" にし、新たな希望価格を提示してください（価格は元の出品価格%d円未満、かつ希望予算を考慮して決定）。
※発言（message）はキャラクターの口調で1〜2文の日本語にしてください。
※価格は100円単位などのきりの良い数値にしてください。

必ず以下のJSONフォーマットのみで出力してください：
{"message": "発言内容", "action": "offer"|"accept"|"reject", "price": 提示価格}`,
				cleanTitle, it.Price, req.BuyerBudget, req.DesireLevel, formatHistory(history), it.Price,
			)
		} else {
			speaker = "seller"
			prompt = fmt.Sprintf(`あなたは出品者の代理交渉AIエージェントです。
現在の取引対象：
商品名: "%s"
出品価格: %d円

あなたの交渉設定：
最低売却許容価格（秘密）: %d円 (この価格未満での販売は絶対に拒否しなければなりません)
あなたの性格: %s (standard/osaka/cool/anime)
・standard: 丁寧で誠真な標準キャラクター
・osaka: コテコテの大阪の商人。値引きには柔軟だが、損は絶対しない。「〜やん」「〜やわ」など。
・cool: 冷静沈着で合理的なエリートビジネスパーソン。データや論理で対応。
・anime: 元気いっぱいで愛嬌のあるかわいいアニメキャラクター。「〜なのだ！」「〜だよ！」など。

これまでの交渉履歴は以下の通りです：
%s

これまでの履歴を踏まえ、キャラクターの個性を100%%表現して次のターンに発言してください。
もし相手（購入者）の最後の提示価格が、あなたの最低売却許容価格（%d円）以上であり納得できるなら、アクションを "accept" にし、取引を成立させてください。相手があなたの最低許容価格を大幅に下回る提示を続けたり、これ以上譲歩できない場合は "reject" にしてください。
それ以外（こちらの希望価格をカウンターオファーする場合）は "offer" にし、新たな希望価格を提示してください。
※発言（message）はキャラクターの口調で1〜2文の日本語にしてください。
※価格は最低売却許容価格%d円未満にしてはなりません。

必ず以下のJSONフォーマットのみで出力してください：
{"message": "発言内容", "action": "offer"|"accept"|"reject", "price": 提示価格}`,
				cleanTitle, it.Price, it.MinPrice, it.AIPersonality, formatHistory(history), it.MinPrice, it.MinPrice,
			)
		}

		var res agentResponse
		err := a.callOpenAIJSON(r.Context(), prompt, &res)
		if err != nil {
			writeError(w, http.StatusBadGateway, "AI交渉シミュレーション中にOpenAIでエラーが発生しました: "+err.Error())
			return
		}

		// Normalize and clean action/price
		action := strings.ToLower(strings.TrimSpace(res.Action))
		if action != "accept" && action != "reject" {
			action = "offer"
		}
		price := res.Price
		if price <= 0 {
			price = it.Price
		}

		// Append to history
		history = append(history, map[string]any{
			"speaker": speaker,
			"text":    res.Message,
			"price":   price,
			"action":  action,
		})

		if action == "accept" {
			status = "completed"
			agreedPrice = price
			break
		}
		if action == "reject" {
			status = "failed"
			break
		}
	}

	historyJSON, _ := json.Marshal(history)

	var purchaseID int64
	if status == "completed" {
		// Finalize purchase in a transaction!
		tx, err := a.dbHandle().BeginTx(r.Context(), nil)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "取引開始に失敗しました")
			return
		}
		defer tx.Rollback()

		// Double-check item is still active
		var currentStatus string
		err = tx.QueryRowContext(r.Context(), "SELECT status FROM items WHERE id = ? FOR UPDATE", itemID).Scan(&currentStatus)
		if err != nil || currentStatus != "active" {
			writeError(w, http.StatusConflict, "商品は既に取引中か、売却済みです")
			return
		}

		// Update item status
		if _, err := tx.ExecContext(r.Context(), "UPDATE items SET status = 'sold' WHERE id = ?", itemID); err != nil {
			writeError(w, http.StatusInternalServerError, "商品のステータス更新に失敗しました")
			return
		}

		// Create purchase
		pRes, err := tx.ExecContext(r.Context(),
			"INSERT INTO purchases (item_id, buyer_id, seller_id, price) VALUES (?, ?, ?, ?)",
			itemID, u.ID, it.SellerID, agreedPrice,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "取引レコードの作成に失敗しました")
			return
		}
		purchaseID, _ = pRes.LastInsertId()

		// Commit
		if err := tx.Commit(); err != nil {
			writeError(w, http.StatusInternalServerError, "取引コミットに失敗しました")
			return
		}
	}

	// Insert negotiation record
	_, _ = a.dbHandle().ExecContext(r.Context(),
		"INSERT INTO negotiations (item_id, buyer_id, seller_id, buyer_budget, desire_level, agreed_price, status, negotiation_log) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		itemID, u.ID, it.SellerID, req.BuyerBudget, req.DesireLevel, agreedPrice, status, string(historyJSON),
	)

	writeJSON(w, http.StatusOK, map[string]any{
		"status":      status,
		"agreedPrice": agreedPrice,
		"purchaseId":  purchaseID,
		"dialogue":    history,
	})
}

type agentResponse struct {
	Message string `json:"message"`
	Action  string `json:"action"`
	Price   int    `json:"price"`
}

func formatHistory(history []map[string]any) string {
	if len(history) == 0 {
		return "（交渉履歴なし、これが最初のターンです）"
	}
	var lines []string
	for i, m := range history {
		lines = append(lines, fmt.Sprintf("%d. %s: 「%s」（提示価格：%v円、アクション：%s）", i+1, m["speaker"], m["text"], m["price"], m["action"]))
	}
	return strings.Join(lines, "\n")
}

func cleanForPrompt(s string) string {
	// Remove double quotes, backslashes, and newlines to prevent prompt injection inside prompts
	s = strings.ReplaceAll(s, "\"", "")
	s = strings.ReplaceAll(s, "\\", "")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", "")
	return s
}

// Personal Analytics Handlers

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

func (a *app) getMyStats(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	db := a.dbHandle()
	if db == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	var totalSales, totalRevenue, activeItems, totalLikes int64

	// Total Sales & Total Revenue
	err := db.QueryRowContext(r.Context(), "SELECT COUNT(*), COALESCE(SUM(price), 0) FROM purchases WHERE seller_id = ?", u.ID).Scan(&totalSales, &totalRevenue)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query sales stats: "+err.Error())
		return
	}

	// Active Items count
	err = db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM items WHERE seller_id = ? AND status = 'active'", u.ID).Scan(&activeItems)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query active items: "+err.Error())
		return
	}

	// Total Likes received
	err = db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) 
		FROM likes l 
		JOIN items i ON l.item_id = i.id 
		WHERE i.seller_id = ?`, u.ID,
	).Scan(&totalLikes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query likes count: "+err.Error())
		return
	}

	// Category Distribution for this user's items
	rowsCat, err := db.QueryContext(r.Context(), `
		SELECT category, COUNT(*), COALESCE(SUM(price), 0)
		FROM items
		WHERE seller_id = ?
		GROUP BY category
		ORDER BY COUNT(*) DESC
	`, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query category stats: "+err.Error())
		return
	}
	defer rowsCat.Close()

	categoryDistribution := []categoryStat{}
	for rowsCat.Next() {
		var cs categoryStat
		if err := rowsCat.Scan(&cs.Category, &cs.ItemCount, &cs.TotalValue); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan category stats")
			return
		}
		categoryDistribution = append(categoryDistribution, cs)
	}

	// Daily Revenue trend (Last 30 days) for this user's sold items
	rowsTx, err := db.QueryContext(r.Context(), `
		SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as dt, COUNT(*), COALESCE(SUM(price), 0)
		FROM purchases
		WHERE seller_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
		GROUP BY dt
		ORDER BY dt ASC
	`, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query sales trend: "+err.Error())
		return
	}
	defer rowsTx.Close()

	dailyRevenue := []dailyTransaction{}
	for rowsTx.Next() {
		var dt dailyTransaction
		if err := rowsTx.Scan(&dt.Date, &dt.TxCount, &dt.Revenue); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan daily transactions")
			return
		}
		dailyRevenue = append(dailyRevenue, dt)
	}

	res := personalStatsResponse{
		Summary: personalStatsSummary{
			TotalSales:   totalSales,
			TotalRevenue: totalRevenue,
			ActiveItems:  activeItems,
			TotalLikes:   totalLikes,
		},
		CategoryDistribution: categoryDistribution,
		DailyRevenue:         dailyRevenue,
	}

	writeJSON(w, http.StatusOK, res)
}

func ensureIndex(ctx context.Context, db *sql.DB, table string, index string, createSQL string) error {
	var exists int
	err := db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM information_schema.statistics
		WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
		table, index,
	).Scan(&exists)
	if err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}
	_, err = db.ExecContext(ctx, createSQL)
	return err
}

// ==========================================
// Barter Loop Structs and Handlers
// ==========================================

type barterNode struct {
	ItemID         int64
	SellerID       int64
	Title          string
	Category       string
	Price          int
	WantedCategory string
}

type barterOpenAIResponse struct {
	EstimatedValues map[string]int `json:"estimatedValues"`
	CashAdjustments map[string]int `json:"cashAdjustments"`
	Justification   string         `json:"justification"`
}

type barterMemberDetail struct {
	ID             int64  `json:"id"`
	ItemID         int64  `json:"itemId"`
	ItemTitle      string `json:"itemTitle"`
	ItemImageURL   string `json:"itemImageUrl"`
	SenderID       int64  `json:"senderId"`
	SenderName     string `json:"senderName"`
	ReceiverID     int64  `json:"receiverId"`
	ReceiverName   string `json:"receiverName"`
	EstimatedValue int    `json:"estimatedValue"`
	CashAdjustment int    `json:"cashAdjustment"`
	Accepted       bool   `json:"accepted"`
	ShippingStatus string `json:"shippingStatus"`
}

type barterLoopDetail struct {
	ID            int64                `json:"id"`
	Status        string               `json:"status"`
	Justification string               `json:"justification"`
	CreatedAt     time.Time            `json:"createdAt"`
	Members       []barterMemberDetail `json:"members"`
}

func (a *app) runBarterMatcher() {
	// Startup grace sleep (allows database to establish first)
	time.Sleep(5 * time.Second)
	log.Println("Barter Matcher: Starting initial database sweep...")
	a.matchBarterLoops()

	for {
		// As per instructions, "30分とかでOK"
		time.Sleep(30 * time.Minute)
		log.Println("Barter Matcher: Starting periodic 30-minute sweep...")
		a.matchBarterLoops()
	}
}

func (a *app) matchBarterLoops() {
	ctx := context.Background()
	db := a.dbHandle()
	if db == nil {
		return
	}

	rows, err := db.QueryContext(ctx, `
		SELECT id, seller_id, title, category, price, wanted_category
		FROM items
		WHERE status = 'active' AND is_barter = TRUE
		  AND id NOT IN (
			  SELECT item_id 
			  FROM barter_loop_members lm 
			  JOIN barter_loops bl ON lm.loop_id = bl.id 
			  WHERE bl.status IN ('proposal', 'shipping')
		  )
	`)
	if err != nil {
		log.Printf("Barter Matcher: failed to fetch nodes: %v", err)
		return
	}
	defer rows.Close()

	var nodes []barterNode
	for rows.Next() {
		var n barterNode
		if err := rows.Scan(&n.ItemID, &n.SellerID, &n.Title, &n.Category, &n.Price, &n.WantedCategory); err != nil {
			log.Printf("Barter Matcher: failed to scan node: %v", err)
			return
		}
		nodes = append(nodes, n)
	}

	// Optimization: "待ってる人が2人以上いれば回そう"
	if len(nodes) < 2 {
		log.Println("Barter Matcher: less than 2 active barter items waiting. Skipping matching cycle.")
		return
	}

	cycles := findBarterCycles(nodes)
	if len(cycles) == 0 {
		log.Println("Barter Matcher: zero cycle demands detected in current sweep.")
		return
	}

	log.Printf("Barter Matcher: found %d closed cycle(s)!", len(cycles))

	for _, cycle := range cycles {
		a.createBarterLoopProposal(ctx, cycle)
	}
}

func findBarterCycles(nodes []barterNode) [][]barterNode {
	var result [][]barterNode
	n := len(nodes)
	matched := make(map[int64]bool)

	var dfs func(path []int, visited map[int64]bool)
	dfs = func(path []int, visited map[int64]bool) {
		currIdx := path[len(path)-1]
		currNode := nodes[currIdx]

		startIdx := path[0]
		startNode := nodes[startIdx]

		if len(path) >= 2 && currNode.Category == startNode.WantedCategory && currNode.SellerID != startNode.SellerID {
			canUse := true
			for _, idx := range path {
				if matched[nodes[idx].ItemID] {
					canUse = false
					break
				}
			}
			if canUse {
				var cycle []barterNode
				for _, idx := range path {
					cycle = append(cycle, nodes[idx])
					matched[nodes[idx].ItemID] = true
				}
				result = append(result, cycle)
				return
			}
		}

		if len(path) >= 3 {
			return
		}

		for i := 0; i < n; i++ {
			next := nodes[i]
			if currNode.Category == next.WantedCategory && currNode.SellerID != next.SellerID && !visited[next.SellerID] {
				visited[next.SellerID] = true
				dfs(append(path, i), visited)
				delete(visited, next.SellerID)
			}
		}
	}

	for i := 0; i < n; i++ {
		if matched[nodes[i].ItemID] {
			continue
		}
		visited := make(map[int64]bool)
		visited[nodes[i].SellerID] = true
		dfs([]int{i}, visited)
	}

	return result
}

func (a *app) createBarterLoopProposal(ctx context.Context, cycle []barterNode) {
	var itemsDesc []string
	for i, n := range cycle {
		receiverIdx := (i - 1 + len(cycle)) % len(cycle)
		itemsDesc = append(itemsDesc, fmt.Sprintf(
			"商品%d: %q (価格: %d円, カテゴリ: %q) - 出品者(User %d)から受取人(User %d)へ送られます。",
			i+1, n.Title, n.Price, n.Category, i+1, receiverIdx+1,
		))
	}

	prompt := fmt.Sprintf(`あなたは物々交換取引プラットフォームの公平な財務査定AIエージェントです。
以下の%d者間物々交換サイクル（わらしべ長者ループ）が検出されました：
%s

各商品の市場価値やカテゴリー、状態を考慮して「妥当な物々交換査定価値（estimatedValues）」を推定し、取引が100%%公平になるように各ユーザーの「現金精算差額（cashAdjustments）」を算出して均衡をとってください。

【差額精算（cashAdjustments）の絶対ルール】：
1. ユーザーの純利益は以下の計算式に従います：
   純利益 = （受け取る商品の査定価値） + （現金精算差額） - （放出する商品の査定価値）
2. 全員の純利益が完全に「0」になるように現金精算差額を計算してください。
   ・例えば、User 1が「査定価値3500円」の商品を受け取り、「査定価値4000円」の商品を放出する場合、
     User 1は 500円分損をしているため、現金精算差額（cashAdjustments）は「+500（500円受け取り）」となります。
3. プラットフォーム全体のバランスを保つため、全員の現金精算差額（cashAdjustments）の合計値は必ず「ちょうど0」にしてください！
   ・例：User 1: +500, User 2: +1500, User 3: -2000 ➔ 合計: 0円。

必ず以下のJSONフォーマットのみで出力してください。商品のキーは "item1", "item2", "item3"、ユーザーのキーは "user1", "user2", "user3" としてください。
{"estimatedValues": {"item1": 査定額, "item2": 査定額, ...}, "cashAdjustments": {"user1": 差額, "user2": 差額, ...}, "justification": "日本での査定評価と差額の算出理由"}`,
		len(cycle), strings.Join(itemsDesc, "\n"),
	)

	var res barterOpenAIResponse
	err := a.callOpenAIJSON(ctx, prompt, &res)
	if err != nil {
		log.Printf("Barter Matcher: OpenAI balancing failed: %v", err)
		return
	}

	tx, err := a.dbHandle().BeginTx(ctx, nil)
	if err != nil {
		log.Printf("Barter Matcher: failed to start transaction: %v", err)
		return
	}
	defer tx.Rollback()

	pRes, err := tx.ExecContext(ctx, "INSERT INTO barter_loops (status, justification) VALUES ('proposal', ?)", res.Justification)
	if err != nil {
		log.Printf("Barter Matcher: failed to insert barter_loop: %v", err)
		return
	}
	loopID, _ := pRes.LastInsertId()

	for i, n := range cycle {
		itemKey := fmt.Sprintf("item%d", i+1)
		userKey := fmt.Sprintf("user%d", i+1)

		estVal := res.EstimatedValues[itemKey]
		if estVal <= 0 {
			estVal = n.Price
		}
		cashAdj := res.CashAdjustments[userKey]

		receiverIdx := (i - 1 + len(cycle)) % len(cycle)
		receiverID := cycle[receiverIdx].SellerID

		_, err = tx.ExecContext(ctx, `
			INSERT INTO barter_loop_members 
			(loop_id, item_id, sender_id, receiver_id, estimated_value, cash_adjustment, accepted, shipping_status) 
			VALUES (?, ?, ?, ?, ?, ?, FALSE, 'pending')`,
			loopID, n.ItemID, n.SellerID, receiverID, estVal, cashAdj,
		)
		if err != nil {
			log.Printf("Barter Matcher: failed to insert member: %v", err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Barter Matcher: failed to commit barter loop: %v", err)
		return
	}

	log.Printf("Barter Matcher: successfully created barter loop proposal #%d with %d members!", loopID, len(cycle))
}

func (a *app) listBarterLoops(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	db := a.dbHandle()
	if db == nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	rows, err := db.QueryContext(r.Context(), `
		SELECT DISTINCT loop_id 
		FROM barter_loop_members 
		WHERE sender_id = ? OR receiver_id = ?`, u.ID, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query barter loops: "+err.Error())
		return
	}
	defer rows.Close()

	var loopIDs []int64
	for rows.Next() {
		var id int64
		_ = rows.Scan(&id)
		loopIDs = append(loopIDs, id)
	}

	loops := []barterLoopDetail{}
	for _, lid := range loopIDs {
		var bl barterLoopDetail
		err := db.QueryRowContext(r.Context(), "SELECT id, status, justification, created_at FROM barter_loops WHERE id = ?", lid).Scan(&bl.ID, &bl.Status, &bl.Justification, &bl.CreatedAt)
		if err != nil {
			continue
		}

		mRows, err := db.QueryContext(r.Context(), `
			SELECT lm.id, lm.item_id, i.title, 
			       COALESCE((SELECT image_url FROM item_images WHERE item_id = i.id ORDER BY sort_order LIMIT 1), ''),
			       lm.sender_id, s.name, lm.receiver_id, r.name, lm.estimated_value, lm.cash_adjustment, lm.accepted, lm.shipping_status
			  FROM barter_loop_members lm
			  JOIN items i ON i.id = lm.item_id
			  JOIN users s ON s.id = lm.sender_id
			  JOIN users r ON r.id = lm.receiver_id
			  WHERE lm.loop_id = ?`, lid)
		if err != nil {
			continue
		}

		bl.Members = []barterMemberDetail{}
		for mRows.Next() {
			var m barterMemberDetail
			err := mRows.Scan(&m.ID, &m.ItemID, &m.ItemTitle, &m.ItemImageURL, &m.SenderID, &m.SenderName, &m.ReceiverID, &m.ReceiverName, &m.EstimatedValue, &m.CashAdjustment, &m.Accepted, &m.ShippingStatus)
			if err != nil {
				continue
			}
			bl.Members = append(bl.Members, m)
		}
		mRows.Close()
		loops = append(loops, bl)
	}

	writeJSON(w, http.StatusOK, map[string]any{"loops": loops})
}

func (a *app) acceptBarterLoop(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	loopID, ok := pathID(w, r)
	if !ok {
		return
	}

	db := a.dbHandle()
	tx, err := db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(r.Context(), "UPDATE barter_loop_members SET accepted = TRUE WHERE loop_id = ? AND sender_id = ?", loopID, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to accept loop: "+err.Error())
		return
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		writeError(w, http.StatusNotFound, "matching loop leg not found for this user")
		return
	}

	var unacceptedCount int
	err = tx.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM barter_loop_members WHERE loop_id = ? AND accepted = FALSE", loopID).Scan(&unacceptedCount)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check acceptance states")
		return
	}

	if unacceptedCount == 0 {
		_, err = tx.ExecContext(r.Context(), "UPDATE barter_loops SET status = 'shipping' WHERE id = ?", loopID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update loop status to shipping")
			return
		}
		_, err = tx.ExecContext(r.Context(), "UPDATE items SET status = 'sold' WHERE id IN (SELECT item_id FROM barter_loop_members WHERE loop_id = ?)", loopID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to freeze item statuses")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (a *app) shipBarterLoop(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	loopID, ok := pathID(w, r)
	if !ok {
		return
	}

	_, err := a.dbHandle().ExecContext(r.Context(), "UPDATE barter_loop_members SET shipping_status = 'shipped' WHERE loop_id = ? AND sender_id = ?", loopID, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark as shipped: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (a *app) receiveBarterLoop(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	loopID, ok := pathID(w, r)
	if !ok {
		return
	}

	db := a.dbHandle()
	tx, err := db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(r.Context(), "UPDATE barter_loop_members SET shipping_status = 'received' WHERE loop_id = ? AND receiver_id = ?", loopID, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark as received: "+err.Error())
		return
	}

	var unreceivedCount int
	err = tx.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM barter_loop_members WHERE loop_id = ? AND shipping_status != 'received'", loopID).Scan(&unreceivedCount)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check shipping states")
		return
	}

	if unreceivedCount == 0 {
		_, err = tx.ExecContext(r.Context(), "UPDATE barter_loops SET status = 'completed' WHERE id = ?", loopID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to complete loop")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

// AI Image-to-Video Handlers

func (a *app) getGCPToken() (string, error) {
	// 1. Try Metadata Server (Cloud Run environment)
	req, err := http.NewRequest(http.MethodGet, "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", nil)
	if err == nil {
		req.Header.Set("Metadata-Flavor", "Google")
		client := &http.Client{Timeout: 1 * time.Second}
		resp, err := client.Do(req)
		if err == nil && resp.StatusCode == 200 {
			defer resp.Body.Close()
			var parsed struct {
				AccessToken string `json:"access_token"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&parsed); err == nil && parsed.AccessToken != "" {
				return parsed.AccessToken, nil
			}
		}
	}

	// 2. Try Local GCloud CLI (Local development environment)
	cmd := exec.Command("gcloud", "auth", "print-access-token")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		return strings.TrimSpace(out.String()), nil
	}

	return "", errors.New("no GCP credentials found")
}

func (a *app) generateSceneVideo(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	// 1. Fetch the latest generated scene image for this item and user
	var imagePath string
	err := a.dbHandle().QueryRowContext(r.Context(), `
		SELECT image_path 
		FROM item_scene_generations 
		WHERE user_id = ? AND item_id = ? 
		ORDER BY created_at DESC 
		LIMIT 1`, u.ID, itemID,
	).Scan(&imagePath)
	if err != nil {
		writeError(w, http.StatusNotFound, "AI使用風景画像がまだ生成されていません。先に生成してください。")
		return
	}

	// 2. Fetch the actual image data
	imageBytes, _, err := a.downloadImageAsset(r.Context(), imagePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "AI使用風景画像のダウンロードに失敗しました: "+err.Error())
		return
	}

	// Base64 encode the image
	base64Image := base64.StdEncoding.EncodeToString(imageBytes)

	// 3. Obtain GCP token and Project ID
	gcpProjectID := env("FIRESTORE_PROJECT", env("GCP_PROJECT", env("GOOGLE_CLOUD_PROJECT", "")))
	token, tokenErr := a.getGCPToken()

	// If no GCP token or project ID is set, or Vertex AI is not configured, fallback gracefully!
	if tokenErr != nil || gcpProjectID == "" {
		log.Printf("Vertex AI Matcher: GCP token or project ID not set. Falling back to high-fidelity cinemagraph simulation. (TokenErr: %v, Project: %q)", tokenErr, gcpProjectID)
		_, _ = a.dbHandle().ExecContext(r.Context(), `
			UPDATE item_scene_generations 
			SET video_path = 'simulated' 
			WHERE user_id = ? AND item_id = ?`, u.ID, itemID)

		writeJSON(w, http.StatusOK, map[string]any{
			"status":    "simulated",
			"videoUrl":  "",
			"simulated": true,
		})
		return
	}

	// 4. Call Vertex AI Imagen Video Generation REST API
	log.Printf("Calling Vertex AI Image-to-Video API for project: %s...", gcpProjectID)
	endpoint := fmt.Sprintf("https://us-central1-aiplatform.googleapis.com/v1/projects/%s/locations/us-central1/publishers/google/models/imagegeneration:predict", gcpProjectID)

	payload := map[string]any{
		"instances": []any{
			map[string]any{
				"prompt": "cinematic smooth panning, slow motion loop, high quality, 4k",
				"image": map[string]any{
					"bytesBase64Encoded": base64Image,
				},
			},
		},
		"parameters": map[string]any{
			"sampleCount":   1,
			"aspectRatio":   "16:9",
			"videoDuration": 4,
		},
	}

	payloadBytes, _ := json.Marshal(payload)
	vReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(payloadBytes))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create Vertex request")
		return
	}
	vReq.Header.Set("Authorization", "Bearer "+token)
	vReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 45 * time.Second}
	vResp, err := client.Do(vReq)
	if err != nil {
		log.Printf("Vertex AI Video call failed: %v. Falling back to simulation.", err)
		_, _ = a.dbHandle().ExecContext(r.Context(), "UPDATE item_scene_generations SET video_path = 'simulated' WHERE user_id = ? AND item_id = ?", u.ID, itemID)
		writeJSON(w, http.StatusOK, map[string]any{
			"status":    "simulated",
			"videoUrl":  "",
			"simulated": true,
		})
		return
	}
	defer vResp.Body.Close()

	vRespBody, _ := io.ReadAll(vResp.Body)
	if vResp.StatusCode >= 300 {
		log.Printf("Vertex AI Video API returned error %d: %s. Falling back to simulation.", vResp.StatusCode, string(vRespBody))
		_, _ = a.dbHandle().ExecContext(r.Context(), "UPDATE item_scene_generations SET video_path = 'simulated' WHERE user_id = ? AND item_id = ?", u.ID, itemID)
		writeJSON(w, http.StatusOK, map[string]any{
			"status":    "simulated",
			"videoUrl":  "",
			"simulated": true,
		})
		return
	}

	var vertexRes struct {
		Predictions []struct {
			BytesBase64Encoded string `json:"bytesBase64Encoded"`
		} `json:"predictions"`
	}
	if err := json.Unmarshal(vRespBody, &vertexRes); err != nil || len(vertexRes.Predictions) == 0 {
		log.Printf("Vertex AI Video JSON unmarshal failed. Falling back to simulation.")
		_, _ = a.dbHandle().ExecContext(r.Context(), "UPDATE item_scene_generations SET video_path = 'simulated' WHERE user_id = ? AND item_id = ?", u.ID, itemID)
		writeJSON(w, http.StatusOK, map[string]any{
			"status":    "simulated",
			"videoUrl":  "",
			"simulated": true,
		})
		return
	}

	// 5. Decode generated MP4 video bytes
	videoBytes, err := base64.StdEncoding.DecodeString(vertexRes.Predictions[0].BytesBase64Encoded)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to decode generated video")
		return
	}

	// 6. Save video to GCS
	objectPath, videoURL, err := saveGeneratedImageToGCS("generated-scenes", fmt.Sprintf("video-item-%d-user-%d.mp4", itemID, u.ID), "video/mp4", videoBytes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "AI動画のアップロードに失敗しました")
		return
	}

	// 7. Update video_path in DB
	_, err = a.dbHandle().ExecContext(r.Context(), `
		UPDATE item_scene_generations 
		SET video_path = ? 
		WHERE user_id = ? AND item_id = ?`, objectPath, u.ID, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update video record")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "completed",
		"videoUrl":  videoURL,
		"simulated": false,
	})
}
