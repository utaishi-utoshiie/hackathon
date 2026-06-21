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
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"next-market/backend/migrations"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

func init() {
	_ = mime.AddExtensionType(".css", "text/css; charset=utf-8")
	_ = mime.AddExtensionType(".js", "application/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".png", "image/png")
	_ = mime.AddExtensionType(".jpg", "image/jpeg")
	_ = mime.AddExtensionType(".jpeg", "image/jpeg")
	_ = mime.AddExtensionType(".json", "application/json; charset=utf-8")
}

type user struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	AvatarURL string    `json:"avatarUrl"`
	CreatedAt time.Time `json:"createdAt"`
}

type item struct {
	ID                int64     `json:"id"`
	SellerID          int64     `json:"sellerId"`
	SellerName        string    `json:"sellerName"`
	SellerAvatarURL   string    `json:"sellerAvatarUrl"`
	SellerRatingAvg   float64   `json:"sellerRatingAvg"`
	SellerRatingCount int       `json:"sellerRatingCount"`
	SellerTxCount     int       `json:"sellerTxCount"`
	Title             string    `json:"title"`
	Description       string    `json:"description"`
	Category          string    `json:"category"`
	Price             int       `json:"price"`
	MinPrice          int       `json:"minPrice"`
	AIPersonality     string    `json:"aiPersonality"`
	BarterEnabled     bool      `json:"barterEnabled"`
	WantCategory      string    `json:"wantCategory"`
	Status            string    `json:"status"`
	ImageURL          string    `json:"imageUrl"`
	LikeCount         int       `json:"likeCount"`
	CreatedAt         time.Time `json:"createdAt"`
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
	PurchaseID           int64     `json:"purchaseId"`
	PurchaseStatus       string    `json:"purchaseStatus"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type message struct {
	ID             int64     `json:"id"`
	ConversationID int64     `json:"conversationId"`
	SenderID       int64     `json:"senderId"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"createdAt"`
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

type ItemScene struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"userId"`
	ItemID    int64  `json:"itemId"`
	ImagePath string `json:"imagePath"`
	ImageUrl  string `json:"imageUrl"`
	Prompt    string `json:"prompt"`
	VideoPath string `json:"videoPath"`
	VideoUrl  string `json:"videoUrl"`
}

type app struct {
	db            *sql.DB
	jwtSecret     string
	allowedOrigin string
	imageStore    imageStore
	dbErr         error
	dbMu          sync.RWMutex
}

func main() {
	_ = os.Setenv("TZ", "UTC")
	// .env を複数の候補パスから順に探す（go run / ビルド済みバイナリ どちらの実行位置でも動作する）
	for _, p := range []string{".env", "../.env", "../../.env"} {
		if err := godotenv.Load(p); err == nil {
			break
		}
	}

	dbDSN, err := dsn()
	if err != nil {
		log.Fatalf("failed to build DSN: %v", err)
	}

	db, err := sql.Open("mysql", dbDSN)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	db.SetMaxOpenConns(100) // Scaled up connection pool as recommended by performance audit
	db.SetMaxIdleConns(50)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		log.Printf("initial database connection failed: %v. Stating recovery loop.", err)
	} else {
		log.Println("database connection established. Running migrations...")
		if err := migrate(ctx, db); err != nil {
			log.Fatalf("failed to run migrations: %v", err)
		}
	}

	a := &app{
		db:            db,
		jwtSecret:     env("JWT_SECRET", "super-secret-key"),
		allowedOrigin: env("ALLOWED_ORIGIN", "http://localhost:5173"),
	}
	uploadStore, closeUploadStore, err := newImageStore(context.Background())
	if err != nil {
		log.Fatalf("failed to initialize image storage: %v", err)
	}
	defer closeUploadStore()
	a.imageStore = uploadStore
	go a.initDBLoop()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", a.health)
	mux.HandleFunc("POST /api/auth/register", a.register)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/auth/reset-demo", a.resetPasswordDemo)
	mux.HandleFunc("GET /api/items", a.listItems)
	mux.HandleFunc("POST /api/items", a.requireAuth(a.createItem))
	mux.HandleFunc("GET /api/items/{id}", a.getItem)
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
	mux.HandleFunc("POST /api/ai/photo-appraise", a.requireAuth(a.photoAppraise))
	mux.HandleFunc("GET /api/items/{id}/ai-scene", a.requireAuth(a.getLatestItemScene))
	mux.HandleFunc("POST /api/items/{id}/ai-scene", a.requireAuth(a.generateItemScene))
	mux.HandleFunc("POST /api/items/{id}/ai-video", a.requireAuth(a.generateSceneVideo))
	mux.HandleFunc("POST /api/items/{id}/cancel", a.requireAuth(a.cancelItem))
	mux.HandleFunc("POST /api/uploads", a.requireAuth(a.uploadImage))
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(env("UPLOAD_DIR", "uploads")))))
	mux.HandleFunc("POST /api/profile", a.requireAuth(a.updateProfile))
	mux.HandleFunc("POST /api/profile/password", a.requireAuth(a.changePassword))
	mux.HandleFunc("POST /api/demo/seed", a.seedDemo)
	mux.HandleFunc("GET /api/my/items", a.requireAuth(a.listMyItems))
	mux.HandleFunc("GET /api/my/stats", a.requireAuth(a.getMyStats))

	// Negotiation Routes
	mux.HandleFunc("POST /api/items/{id}/negotiate", a.requireAuth(a.negotiateItem))

	// Escrow Purchase Routes
	mux.HandleFunc("POST /api/purchases/{id}/ship", a.requireAuth(a.shipPurchase))
	mux.HandleFunc("POST /api/purchases/{id}/receive", a.requireAuth(a.receivePurchase))

	// Barter Loop Routes
	mux.HandleFunc("GET /api/barter/loops", a.requireAuth(a.listBarterLoops))
	mux.HandleFunc("POST /api/barter/loops/{id}/accept", a.requireAuth(a.acceptBarterLoop))
	mux.HandleFunc("POST /api/barter/loops/{id}/ship", a.requireAuth(a.shipBarterLoop))
	mux.HandleFunc("POST /api/barter/loops/{id}/receive", a.requireAuth(a.receiveBarterLoop))

	// Admin Dashboard Routes
	mux.HandleFunc("GET /api/admin/stats", a.requireAuth(a.requireAdmin(a.getAdminStats)))
	mux.HandleFunc("GET /api/admin/moderations", a.requireAuth(a.requireAdmin(a.getAdminModerations)))
	mux.HandleFunc("GET /api/admin/users", a.requireAuth(a.requireAdmin(a.getAdminUsers)))
	mux.HandleFunc("PUT /api/admin/users/{id}/role", a.requireAuth(a.requireAdmin(a.updateUserRole)))

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
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api") || strings.HasPrefix(r.URL.Path, "/uploads/") {
			api.ServeHTTP(w, r)
			return
		}
		if _, err := os.Stat(filepath.Join(staticDir, r.URL.Path)); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
}

func findFrontendDir() (string, bool) {
	candidates := []string{
		"../frontend/dist",
		"frontend/dist",
		"./dist",
		"./public",
		"public",
	}
	for _, dir := range candidates {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			if _, err := os.Stat(filepath.Join(dir, "index.html")); err == nil {
				abs, _ := filepath.Abs(dir)
				return abs, true
			}
		}
	}
	return "", false
}

func (a *app) guardDB(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db := a.dbHandle()
		if db == nil {
			writeError(w, http.StatusServiceUnavailable, "database is starting up, please try again in a few seconds")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) dbHandle() *sql.DB {
	a.dbMu.Lock()
	defer a.dbMu.Unlock()
	return a.db
}

func (a *app) setDBHandle(db *sql.DB) {
	a.dbMu.Lock()
	defer a.dbMu.Unlock()
	a.db = db
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

func env(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func base64JSON(v any) string {
	data, _ := json.Marshal(v)
	return base64.RawURLEncoding.EncodeToString(data)
}

func hmacSHA256(data, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

func signedGCSUploadURL(prefix, filename, contentType string) (string, string, string, error) {
	bucket := env("GCS_BUCKET", "")
	if bucket == "" {
		return "", "", "", errors.New("missing GCS_BUCKET environment variable")
	}
	objectName := fmt.Sprintf("%s/%d-%s", prefix, time.Now().UnixNano(), filename)
	uploadURL, err := signedGCSURL(bucket, objectName, http.MethodPut, contentType, 15*time.Minute)
	if err != nil {
		return "", "", "", err
	}
	publicURL := gcsPathToPublicURL(fmt.Sprintf("gcs://%s/%s", bucket, objectName))
	return uploadURL, publicURL, fmt.Sprintf("gcs://%s/%s", bucket, objectName), nil
}

func signedGCSURL(bucket, objectName, method, contentType string, expires time.Duration) (string, error) {
	serviceAccount := env("GCS_SERVICE_ACCOUNT", "")
	if serviceAccount == "" {
		return fmt.Sprintf("https://storage.googleapis.com/%s/%s", bucket, objectName), nil
	}
	return "", errors.New("unimplemented GCS service account signing")
}

func gcsPathStyleURL(bucket, objectName string) string {
	return fmt.Sprintf("https://storage.googleapis.com/%s/%s", bucket, objectName)
}

func gcsPathToPublicURL(path string) string {
	if !strings.HasPrefix(path, "gcs://") {
		return path
	}
	trimmed := strings.TrimPrefix(path, "gcs://")
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) != 2 {
		return path
	}
	return gcsPathStyleURL(parts[0], parts[1])
}

func (a *app) downloadImageAsset(ctx context.Context, path string) ([]byte, string, error) {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, nil)
		if err != nil {
			return nil, "", err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 {
			return nil, "", fmt.Errorf("failed to fetch url %s: status %d", path, resp.StatusCode)
		}
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, "", err
		}
		return data, resp.Header.Get("Content-Type"), nil
	}

	if strings.HasPrefix(path, "gcs://") {
		bucket, objectName, err := parseGCSRef(path)
		if err != nil {
			return nil, "", err
		}
		readURL, err := signedGCSURL(bucket, objectName, http.MethodGet, "", 15*time.Minute)
		if err != nil {
			return nil, "", err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, readURL, nil)
		if err != nil {
			return nil, "", err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 {
			return nil, "", fmt.Errorf("failed to fetch GCS ref %s: status %d", path, resp.StatusCode)
		}
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, "", err
		}
		return data, resp.Header.Get("Content-Type"), nil
	}

	return nil, "", errors.New("unsupported asset path format")
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
		return "", "", fmt.Errorf("failed to upload asset: status %d", resp.StatusCode)
	}
	return objectPath, gcsPathToPublicURL(objectPath), nil
}

func (a *app) callOpenAI(ctx context.Context, prompt string) (string, error) {
	apiKey := a.getSecret(ctx, "OPENAI_API_KEY")
	if apiKey == "" {
		return "AI機能（シミュレーション）が稼働しました！", nil
	}

	reqBody, _ := json.Marshal(map[string]any{
		"model": "gpt-4o-mini",
		"messages": []any{
			map[string]string{"role": "user", "content": prompt},
		},
		"temperature": 0.7,
	})

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("OpenAI API returned error %d: %s", resp.StatusCode, string(body))
	}

	var res struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}

	if len(res.Choices) == 0 {
		return "", errors.New("OpenAI API returned empty response")
	}

	return res.Choices[0].Message.Content, nil
}

func (a *app) callOpenAIJSON(ctx context.Context, prompt string, v any) error {
	apiKey := a.getSecret(ctx, "OPENAI_API_KEY")
	if apiKey == "" {
		return errors.New("missing OPENAI_API_KEY")
	}

	reqBody, _ := json.Marshal(map[string]any{
		"model": "gpt-4o-mini",
		"messages": []any{
			map[string]string{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
		"temperature":     0.2,
	})

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("OpenAI API returned error %d: %s", resp.StatusCode, string(body))
	}

	var res struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return err
	}

	if len(res.Choices) == 0 {
		return errors.New("OpenAI API returned empty response")
	}

	return json.Unmarshal([]byte(res.Choices[0].Message.Content), v)
}

type imageUpload struct {
	Filename    string
	ContentType string
	Bytes       []byte
}

// callOpenAIImageGenerate は gpt-image-2 の /v1/images/edits で
// ユーザーアバター画像＋商品画像を合成し、使用シーン画像を生成します。
func (a *app) callOpenAIImageGenerate(ctx context.Context, prompt string, uploads []imageUpload) ([]byte, error) {
	apiKey := a.getSecret(ctx, "OPENAI_API_KEY")
	if apiKey == "" {
		return nil, errors.New("missing OPENAI_API_KEY")
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	_ = writer.WriteField("model", "gpt-image-2")
	_ = writer.WriteField("prompt", prompt)
	_ = writer.WriteField("n", "1")
	_ = writer.WriteField("size", "1024x1024")

	// 複数画像を image[] フィールドで送信（gpt-image-2 の複数画像合成形式）
	for _, up := range uploads {
		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="image[]"; filename="%s"`, up.Filename))
		h.Set("Content-Type", up.ContentType)
		part, err := writer.CreatePart(h)
		if err != nil {
			return nil, err
		}
		_, _ = part.Write(up.Bytes)
	}
	_ = writer.Close()

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/images/edits", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gpt-image-2 API error %d: %s", resp.StatusCode, string(respBody))
	}

	var res struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &res); err != nil {
		return nil, err
	}
	if len(res.Data) == 0 {
		return nil, errors.New("gpt-image-2 returned no image data")
	}

	// b64_json があればそれを使用し、なければ URL から画像をダウンロードする
	if res.Data[0].B64JSON != "" {
		return base64.StdEncoding.DecodeString(res.Data[0].B64JSON)
	}

	if res.Data[0].URL == "" {
		return nil, errors.New("gpt-image-2 returned neither url nor b64_json")
	}

	imgReq, err := http.NewRequestWithContext(ctx, http.MethodGet, res.Data[0].URL, nil)
	if err != nil {
		return nil, err
	}
	imgResp, err := http.DefaultClient.Do(imgReq)
	if err != nil {
		return nil, err
	}
	defer imgResp.Body.Close()

	if imgResp.StatusCode >= 300 {
		imgErrBody, _ := io.ReadAll(imgResp.Body)
		return nil, fmt.Errorf("failed to download image from gpt-image-2 URL %d: %s", imgResp.StatusCode, string(imgErrBody))
	}

	return io.ReadAll(imgResp.Body)
}

func (a *app) callOpenAIImageEdit(ctx context.Context, prompt string, uploads []imageUpload) ([]byte, error) {
	apiKey := a.getSecret(ctx, "OPENAI_API_KEY")
	if apiKey == "" {
		return nil, errors.New("missing OPENAI_API_KEY")
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	_ = writer.WriteField("prompt", prompt)
	_ = writer.WriteField("n", "1")
	_ = writer.WriteField("size", "1024x1024")
	_ = writer.WriteField("response_format", "b64_json")

	for i, up := range uploads {
		fieldName := "image"
		if i == 1 {
			fieldName = "mask"
		}

		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, up.Filename))
		h.Set("Content-Type", up.ContentType)

		part, err := writer.CreatePart(h)
		if err != nil {
			return nil, err
		}
		_, _ = part.Write(up.Bytes)
	}

	_ = writer.Close()

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/images/edits", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("OpenAI Image Edit API returned error %d: %s", resp.StatusCode, string(respBody))
	}

	var res struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &res); err != nil {
		return nil, err
	}

	if len(res.Data) == 0 {
		return nil, errors.New("OpenAI Image Edit API returned no images")
	}

	return base64.StdEncoding.DecodeString(res.Data[0].B64JSON)
}

func itemScenePrompt() string {
	return `flea market product usage scene.
Blend the product image naturally onto a table, shelf, or hands of a person. Seamlessly merge the user avatar in the background or as the person happily looking at or holding the product. If the product is wearable, place it on the user's avatar as if they are trying it on.
Do not cover the core design of the product. The environment should look warm, clean, modern, and highly appealing for a flea market listing. Output the final merged picture.`
}

func (a *app) saveAI(ctx context.Context, userID int64, itemID *int64, featureType string, prompt string, result string) {
	var itemIDVal sql.NullInt64
	if itemID != nil {
		itemIDVal = sql.NullInt64{Int64: *itemID, Valid: true}
	}
	_, _ = a.dbHandle().ExecContext(ctx,
		"INSERT INTO ai_interactions_log (user_id, item_id, feature_type, prompt, result) VALUES (?, ?, ?, ?, ?)",
		userID, itemIDVal, featureType, prompt, result,
	)
}

func migrate(ctx context.Context, db *sql.DB) error {
	// Self-healing DB check: If barter_loop_members is missing the 'user_id' column, drop and let Goose recreate them cleanly
	var colCount int
	_ = db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_schema = DATABASE() AND table_name = 'barter_loop_members' AND column_name = 'user_id'`).Scan(&colCount)
	if colCount == 0 {
		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS barter_loop_members")
		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS barter_loops")
	}

	// Run embedded Goose migrations
	if err := migrations.RunMigrations(db); err != nil {
		return err
	}

	// Dynamically and idempotently apply composite performance indexes to prevent MySQL duplicate key errors (Error 1061)
	if err := ensureIndex(ctx, db, "purchases", "idx_purchases_seller_created_at_price",
		"CREATE INDEX idx_purchases_seller_created_at_price ON purchases (seller_id, created_at, price)"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "items", "idx_items_seller_status_created_at",
		"CREATE INDEX idx_items_seller_status_created_at ON items (seller_id, status, created_at)"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "likes", "idx_likes_item_user",
		"CREATE INDEX idx_likes_item_user ON likes (item_id, user_id)"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "item_images", "idx_images_item_sort_url",
		"CREATE INDEX idx_images_item_sort_url ON item_images (item_id, sort_order, image_url(255))"); err != nil {
		return err
	}
	if err := ensureIndex(ctx, db, "user_reviews", "idx_reviews_ee_rating",
		"CREATE INDEX idx_reviews_ee_rating ON user_reviews (reviewee_id, rating)"); err != nil {
		return err
	}

	return nil
}

func ensureIndex(ctx context.Context, db *sql.DB, tableName, indexName, createSQL string) error {
	var count int
	err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) 
		FROM information_schema.statistics 
		WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`, tableName, indexName,
	).Scan(&count)
	if err != nil {
		return err
	}
	if count == 0 {
		log.Printf("Dynamically and idempotently applying composite performance index: %s on %s...", indexName, tableName)
		if _, err := db.ExecContext(ctx, createSQL); err != nil {
			return fmt.Errorf("failed to create index %s: %v", indexName, err)
		}
	}
	return nil
}

func dsn() (string, error) {
	if dsn := os.Getenv("DATABASE_DSN"); dsn != "" {
		return dsn, nil
	}

	dbUser := os.Getenv("DB_USER")
	dbPass := os.Getenv("DB_PASS")
	dbName := os.Getenv("DB_NAME")

	if dbUser == "" || dbPass == "" || dbName == "" {
		return "", errors.New("missing database credentials: set DATABASE_DSN, or DB_USER/DB_PASS/DB_NAME")
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
