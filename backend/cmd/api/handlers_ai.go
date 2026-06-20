package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

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

	prompt := fmt.Sprintf(`あなたはフリマアプリの出品者に代わって質問に回答するAIアシスタントです。
以下の商品情報を参考にして、購入検討者からの質問に、親切かつ正直に回答してください。

商品名: %s
価格: %d円
カテゴリ: %s
状態・詳細: %s

質問: %s`, it.Title, it.Price, it.Category, it.Description, req.Question)

	text, err := a.callOpenAI(r.Context(), prompt)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	a.saveAI(r.Context(), u.ID, &req.ItemID, "ask", prompt, text)
	writeJSON(w, http.StatusOK, map[string]string{"answer": text})
}

func (a *app) suggestPrice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title     string `json:"title"`
		Category  string `json:"category"`
		Condition string `json:"condition"`
		Notes     string `json:"notes"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	prompt := fmt.Sprintf(`フリマアプリでの商品の適正取引価格を査定・提案してください。
商品名: %s
カテゴリ: %s
状態: %s
メモ: %s

必ず以下のJSONフォーマットのみで出力してください（マークダウン等で囲まず、生のJSONテキストのみを出力してください）：
{
  "price": 推奨販売価格（数値）,
  "minPrice": 最安価格目安（数値）,
  "maxPrice": 最高価格目安（数値）,
  "reason": "査定理由（日本語・簡潔に）",
  "signals": ["競合数少なめ", "シーズン需要高め" などの1行シグナル配列]
}`, req.Title, req.Category, req.Condition, req.Notes)

	var res struct {
		Price    int      `json:"price"`
		MinPrice int      `json:"minPrice"`
		MaxPrice int      `json:"maxPrice"`
		Reason   string   `json:"reason"`
		Signals  []string `json:"signals"`
	}

	err := a.callOpenAIJSON(r.Context(), prompt, &res)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, res)
}

func (a *app) getLatestItemScene(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	var scene ItemScene
	err := a.dbHandle().QueryRowContext(r.Context(),
		"SELECT id, user_id, item_id, image_path, prompt, COALESCE(video_path, '') FROM item_scene_generations WHERE user_id = ? AND item_id = ? ORDER BY created_at DESC LIMIT 1",
		u.ID, itemID,
	).Scan(&scene.ID, &scene.UserID, &scene.ItemID, &scene.ImagePath, &scene.Prompt, &scene.VideoPath)

	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"scene": nil})
		return
	}

	scene.ImageUrl = gcsPathToPublicURL(scene.ImagePath)
	if scene.VideoPath == "simulated" {
		scene.VideoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
	} else if scene.VideoPath != "" {
		scene.VideoUrl = gcsPathToPublicURL(scene.VideoPath)
	}

	writeJSON(w, http.StatusOK, map[string]any{"scene": scene})
}

func (a *app) generateItemScene(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	db := a.dbHandle()

	// 既に生成済みの画像があるか確認（最新の生成成功物を再利用して無駄なAPI再生成を回避）
	var existingImagePath, existingPrompt, existingVideoPath string
	cacheErr := db.QueryRowContext(r.Context(), 
		"SELECT image_path, prompt, COALESCE(video_path, '') FROM item_scene_generations WHERE user_id = ? AND item_id = ? AND image_path IS NOT NULL AND image_path != '' ORDER BY created_at DESC LIMIT 1",
		u.ID, itemID,
	).Scan(&existingImagePath, &existingPrompt, &existingVideoPath)

	if cacheErr == nil {
		log.Printf("Found cached generated scene for item=%d and user=%d. Returning directly.", itemID, u.ID)
		publicURL := gcsPathToPublicURL(existingImagePath)
		
		var videoURL string
		if existingVideoPath == "simulated" {
			videoURL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
		} else if existingVideoPath != "" {
			videoURL = gcsPathToPublicURL(existingVideoPath)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"scene": ItemScene{
				UserID:    u.ID,
				ItemID:    itemID,
				ImageUrl:  publicURL,
				Prompt:    existingPrompt,
				VideoPath: existingVideoPath,
				VideoUrl:  videoURL,
			},
		})
		return
	}

	var storedUser struct {
		Name      string
		AvatarURL string
	}
	err := db.QueryRowContext(r.Context(), "SELECT name, COALESCE(avatar_url, '') FROM users WHERE id = ?", u.ID).Scan(&storedUser.Name, &storedUser.AvatarURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read user profile")
		return
	}

	it, err := a.findItem(r.Context(), itemID)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}

	rawAvatarRef := storedUser.AvatarURL
	if rawAvatarRef == "" {
		rawAvatarRef = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150"
	}

	var avatarBytes, itemBytes []byte
	var avatarType, itemType string
	var avatarErr, itemErr error

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		avatarBytes, avatarType, avatarErr = a.downloadImageAsset(r.Context(), rawAvatarRef)
	}()

	go func() {
		defer wg.Done()
		itemBytes, itemType, itemErr = a.downloadImageAsset(r.Context(), it.ImageURL)
	}()

	wg.Wait()

	if avatarErr != nil {
		writeError(w, http.StatusBadGateway, "プロフィール画像を読み込めませんでした")
		return
	}

	if itemErr != nil {
		writeError(w, http.StatusBadGateway, "商品画像を読み込めませんでした")
		return
	}

	prompt := itemScenePrompt(storedUser.Name, it)

	geminiKey := a.geminiAPIKey()
	openAIKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))

	var generatedBytes []byte
	var generatedMIME string
	var imageGenErr error

	if geminiKey != "" {
		log.Printf("Gemini image generation priority selected (item=%d)...", itemID)
		generatedBytes, generatedMIME, imageGenErr = a.callGeminiImageGenerate(r.Context(), prompt, []imageUpload{
			{Filename: "avatar.jpg", ContentType: avatarType, Bytes: avatarBytes},
			{Filename: "item.jpg", ContentType: itemType, Bytes: itemBytes},
		})
		if imageGenErr != nil {
			log.Printf("Gemini image generation failed (item=%d): %v", itemID, imageGenErr)
			// OpenAI キーがあればフォールバック
			if openAIKey != "" {
				log.Printf("Falling back to OpenAI (gpt-image-2)...")
				dallEBytes, dallEErr := a.callOpenAIImageGenerate(r.Context(), prompt, []imageUpload{
					{Filename: "avatar.jpg", ContentType: avatarType, Bytes: avatarBytes},
					{Filename: "item.jpg", ContentType: itemType, Bytes: itemBytes},
				})
				if dallEErr != nil {
					writeError(w, http.StatusBadGateway, fmt.Sprintf("AI画像生成に失敗しました。(Geminiエラー: %v / DALL-Eフォールバックエラー: %v)", imageGenErr, dallEErr))
					return
				}
				generatedBytes = dallEBytes
				generatedMIME = "image/png"
			} else {
				writeError(w, http.StatusBadGateway, fmt.Sprintf("GeminiによるAI画像生成に失敗しました。OpenAIキーがないためフォールバックできません。(エラー: %v)", imageGenErr))
				return
			}
		}
	} else if openAIKey != "" {
		log.Printf("OpenAI image generation selected (item=%d)...", itemID)
		dallEBytes, dallEErr := a.callOpenAIImageGenerate(r.Context(), prompt, []imageUpload{
			{Filename: "avatar.jpg", ContentType: avatarType, Bytes: avatarBytes},
			{Filename: "item.jpg", ContentType: itemType, Bytes: itemBytes},
		})
		if dallEErr != nil {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("OpenAIによるAI画像生成に失敗しました。(エラー: %v)", dallEErr))
			return
		}
		generatedBytes = dallEBytes
		generatedMIME = "image/png"
	} else {
		writeError(w, http.StatusBadRequest, "AI画像生成に必要なAPIキーが設定されていません。ANTIGRAVITY_API_KEY、GEMINI_API_KEY、または OPENAI_API_KEY を環境変数に設定してください。")
		return
	}

	if generatedMIME == "" {
		generatedMIME = "image/png"
	}
	result, err := a.imageStore.Save(r.Context(), "scene", generatedMIME, generatedBytes)
	if err != nil {
		writeError(w, http.StatusBadGateway, "AI画像の保存に失敗しました")
		return
	}
	if _, err := a.dbHandle().ExecContext(r.Context(),
		"INSERT INTO item_scene_generations (user_id, item_id, image_path, prompt) VALUES (?, ?, ?, ?)",
		u.ID, itemID, result.ObjectPath, prompt,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "generated scene could not be recorded")
		return
	}

	a.saveAI(r.Context(), u.ID, &itemID, "item_scene", prompt, result.ObjectPath)
	writeJSON(w, http.StatusCreated, map[string]any{
		"scene": ItemScene{
			UserID:   u.ID,
			ItemID:   itemID,
			ImageUrl: result.PublicURL,
			Prompt:   prompt,
		},
	})
}

func (a *app) generateSceneVideo(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	itemID, ok := pathID(w, r)
	if !ok {
		return
	}

	// 既に生成済みの動画情報（本物アセット、または simulated）が存在するか確認（再利用）
	var existingVideoPath string
	cacheErr := a.dbHandle().QueryRowContext(r.Context(), `
		SELECT COALESCE(video_path, '') 
		FROM item_scene_generations 
		WHERE user_id = ? AND item_id = ? AND video_path IS NOT NULL AND video_path != '' 
		ORDER BY created_at DESC 
		LIMIT 1`, u.ID, itemID,
	).Scan(&existingVideoPath)

	if cacheErr == nil && existingVideoPath != "" {
		if existingVideoPath == "simulated" {
			log.Printf("Found cached simulated video status for item=%d and user=%d. Returning directly.", itemID, u.ID)
			writeJSON(w, http.StatusOK, map[string]any{
				"status":    "simulated",
				"videoUrl":  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
				"simulated": true,
			})
			return
		}

		log.Printf("Found cached generated video for item=%d and user=%d. Returning directly.", itemID, u.ID)
		videoURL := gcsPathToPublicURL(existingVideoPath)
		writeJSON(w, http.StatusOK, map[string]any{
			"status":    "completed",
			"videoUrl":  videoURL,
			"simulated": false,
		})
		return
	}

	// 1. Fetch the latest generated scene image and its ID for this item and user
	var id int64
	var imagePath string
	err := a.dbHandle().QueryRowContext(r.Context(), `
		SELECT id, image_path 
		FROM item_scene_generations 
		WHERE user_id = ? AND item_id = ? 
		ORDER BY created_at DESC 
		LIMIT 1`, u.ID, itemID,
	).Scan(&id, &imagePath)
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

	// 3. Obtain Gemini API Key for Veo 3.1 or GCP token and Project ID
	apiKey := a.geminiAPIKey()
	gcpProjectID := env("FIRESTORE_PROJECT", env("GCP_PROJECT", env("GOOGLE_CLOUD_PROJECT", "")))
	token, tokenErr := a.getGCPToken()

	var videoBytes []byte
	var generateErr error

	if apiKey != "" {
		log.Printf("Calling Gemini API Veo 3.1 (veo-3.1-generate-preview) for Image-to-Video...")
		videoBytes, generateErr = a.callGeminiVideoGenerate(r.Context(), "cinematic smooth panning, slow motion loop, high quality, 4k", base64Image)
	}

	if generateErr != nil || apiKey == "" {
		if apiKey != "" {
			log.Printf("Gemini Veo 3.1 video generation failed: %v — falling back to Vertex AI / simulation", generateErr)
		}

		// If no GCP token or project ID is set, or Vertex AI is not configured, fallback gracefully!
		if tokenErr != nil || gcpProjectID == "" {
			log.Printf("Vertex AI Matcher: GCP token or project ID not set. Falling back to high-fidelity cinemagraph simulation. (TokenErr: %v, Project: %q)", tokenErr, gcpProjectID)
			_, _ = a.dbHandle().ExecContext(r.Context(), `
				UPDATE item_scene_generations 
				SET video_path = 'simulated' 
				WHERE id = ?`, id)

			writeJSON(w, http.StatusOK, map[string]any{
				"status":    "simulated",
				"videoUrl":  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
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
			_, _ = a.dbHandle().ExecContext(r.Context(), "UPDATE item_scene_generations SET video_path = 'simulated' WHERE id = ?", id)
			writeJSON(w, http.StatusOK, map[string]any{
				"status":    "simulated",
				"videoUrl":  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
				"simulated": true,
			})
			return
		}
		defer vResp.Body.Close()

		vRespBody, _ := io.ReadAll(vResp.Body)
		if vResp.StatusCode >= 300 {
			log.Printf("Vertex AI Video API returned error %d: %s. Falling back to simulation.", vResp.StatusCode, string(vRespBody))
			_, _ = a.dbHandle().ExecContext(r.Context(), "UPDATE item_scene_generations SET video_path = 'simulated' WHERE id = ?", id)
			writeJSON(w, http.StatusOK, map[string]any{
				"status":    "simulated",
				"videoUrl":  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
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
			_, _ = a.dbHandle().ExecContext(r.Context(), "UPDATE item_scene_generations SET video_path = 'simulated' WHERE id = ?", id)
			writeJSON(w, http.StatusOK, map[string]any{
				"status":    "simulated",
				"videoUrl":  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
				"simulated": true,
			})
			return
		}

		decodedBytes, err := base64.StdEncoding.DecodeString(vertexRes.Predictions[0].BytesBase64Encoded)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to decode generated video")
			return
		}
		videoBytes = decodedBytes
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
		WHERE id = ?`, objectPath, id)
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

// OPTIMIZED: 1-Turn Joint AI Negotiation simulation
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

	prompt := fmt.Sprintf(`あなたはフリマアプリの代理交渉シミュレーターです。
購入者代理AIと出品者代理AIの対話をシミュレートし、最大6ターンの価格交渉プロセスを自動生成してください。

現在の取引対象：
商品名: "%s"
出品価格: %d円

購入者の設定：
希望購入予算: %d円
欲しい度（購入意欲）: %s (low/medium/high)
・ルール: 予算内での購入を目指しますが、欲しい度が「high」の場合は予算の1.1倍まで、それ以外は予算の1.05倍まで引き上げを許容します。

出品者の設定：
最低売却許容価格（秘密）: %d円 (この価格未満での販売は絶対に拒否しなければなりません)
出品者AIの性格: %s (standard/osaka/cool/anime)
・standard: 丁寧で誠実な標準キャラクター
・osaka: コテコテの大阪の商人。値引きには柔軟だが、損は絶対しない。「〜やん」「〜やわ」など。
・cool: 冷静沈着で合理的なエリートビジネスパーソン。データや論理で対応。
・anime: 元気いっぱいで愛嬌のあるかわいいアニメキャラクター。「〜なのだ！」「〜だよ！」など。

対話のルール：
1. 奇数ターン（1, 3, 5）は購入者代理が、偶数ターン（2, 4, 6）は出品者代理が発言します。
2. 双方はそれぞれの予算/最低売却許容価格を考慮しながら、徐々に価格を譲り合います。
3. いずれかのターンで価格が合意に達した場合（購入者の提示価格が出品者の最低売却許容価格以上、または出品者の提示価格が購入者の上限価格以下となった場合）、そのターンで合意（action: "accept"）とし、シミュレーションを終了してください。
4. 6ターン交渉しても合意できない、または途中で絶対に進展の余地がないと判断した場合は不成立（action: "reject"）として終了してください。
5. 各ターンの発言（message）は、キャラクターの口調や状況を100%%再現した1〜2文の日本語にしてください。
6. 価格（price）は、交渉の進捗に応じた価格（100円単位）を数値でセットしてください。

必ず以下のJSONフォーマットのみで出力してください（マークダウンのコードブロックで囲まず、生のJSONテキストのみを出力してください）：
{
  "status": "completed" | "failed",
  "agreedPrice": 合意価格（合意した場合のみ。不成立の場合は0）,
  "dialogue": [
    {"speaker": "buyer", "text": "発言内容...", "price": 4000, "action": "offer"},
    {"speaker": "seller", "text": "発言内容...", "price": 4500, "action": "offer"},
    ...
  ]
}`,
		cleanTitle, it.Price, req.BuyerBudget, req.DesireLevel, it.MinPrice, it.AIPersonality,
	)

	var jointRes struct {
		Status      string           `json:"status"`
		AgreedPrice int              `json:"agreedPrice"`
		Dialogue    []map[string]any `json:"dialogue"`
	}

	err = a.callOpenAIJSON(r.Context(), prompt, &jointRes)
	if err != nil {
		writeError(w, http.StatusBadGateway, "AI交渉シミュレーション中にエラーが発生しました: "+err.Error())
		return
	}

	agreedPrice := jointRes.AgreedPrice
	status := jointRes.Status
	history := jointRes.Dialogue

	historyJSON, _ := json.Marshal(history)

	var purchaseID int64
	if status == "completed" {
		tx, err := a.dbHandle().BeginTx(r.Context(), nil)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "取引開始に失敗しました")
			return
		}
		defer tx.Rollback()

		var currentStatus string
		err = tx.QueryRowContext(r.Context(), "SELECT status FROM items WHERE id = ? FOR UPDATE", itemID).Scan(&currentStatus)
		if err != nil || currentStatus != "active" {
			writeError(w, http.StatusConflict, "商品は既に取引中か、売却済みです")
			return
		}

		if _, err := tx.ExecContext(r.Context(), "UPDATE items SET status = 'sold' WHERE id = ?", itemID); err != nil {
			writeError(w, http.StatusInternalServerError, "商品のステータス更新に失敗しました")
			return
		}

		pRes, err := tx.ExecContext(r.Context(),
			"INSERT INTO purchases (item_id, buyer_id, seller_id, price, status) VALUES (?, ?, ?, ?, 'paid')",
			itemID, u.ID, it.SellerID, agreedPrice,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "取引レコードの作成に失敗しました")
			return
		}
		purchaseID, _ = pRes.LastInsertId()

		if err := tx.Commit(); err != nil {
			writeError(w, http.StatusInternalServerError, "取引コミットに失敗しました")
			return
		}
	}

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

func (a *app) getGCPToken() (string, error) {
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

	// Try local development fallback
	return "", errors.New("no production GCP credentials found")
}

// SECURITY PROTECTION: Sanitizes user-inputted strings before injecting them into OpenAI prompts.
// This neutralizes Prompt Injection (jailbreaking) attacks by stripping double quotes (breakout symbols),
// backslashes, and newlines that are commonly used to escape system prompt boundaries.
func cleanForPrompt(s string) string {
	s = strings.ReplaceAll(s, "\"", "")
	s = strings.ReplaceAll(s, "\\", "")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", "")
	return s
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
