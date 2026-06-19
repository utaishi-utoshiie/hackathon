package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// geminiRequest は Gemini generateContent API のリクエストボディ構造体です。
type geminiRequest struct {
	Contents         []geminiContent  `json:"contents"`
	Tools            []geminiTool     `json:"tools,omitempty"`
	GenerationConfig *geminiGenConfig `json:"generationConfig,omitempty"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text       string            `json:"text,omitempty"`
	InlineData *geminiInlineData `json:"inlineData,omitempty"`
}

type geminiInlineData struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type geminiTool struct {
	GoogleSearch *struct{} `json:"googleSearch,omitempty"`
}

type geminiGenConfig struct {
	ResponseMimeType string `json:"responseMimeType,omitempty"`
}

// geminiResponse はGemini APIのレスポンスボディ
type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func geminiModel() string {
	if m := os.Getenv("GEMINI_MODEL"); m != "" {
		return m
	}
	return "gemini-2.0-flash"
}

// callGeminiVision sends an image + text prompt to Gemini and returns a JSON string.
// Used for product identification from photos.
func (a *app) callGeminiVision(ctx context.Context, imageBase64, mimeType, prompt string) (string, error) {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" {
		return "", fmt.Errorf("missing GEMINI_API_KEY")
	}

	reqBody := geminiRequest{
		Contents: []geminiContent{{
			Parts: []geminiPart{
				{InlineData: &geminiInlineData{MimeType: mimeType, Data: imageBase64}},
				{Text: prompt},
			},
		}},
		GenerationConfig: &geminiGenConfig{
			ResponseMimeType: "application/json",
		},
	}

	return a.doGeminiRequest(ctx, apiKey, reqBody)
}

// callGeminiSearch sends a text prompt to Gemini with Google Search grounding enabled.
// Used for real-time market price research.
func (a *app) callGeminiSearch(ctx context.Context, prompt string) (string, error) {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" {
		return "", fmt.Errorf("missing GEMINI_API_KEY")
	}

	reqBody := geminiRequest{
		Contents: []geminiContent{{
			Parts: []geminiPart{{Text: prompt}},
		}},
		Tools: []geminiTool{{GoogleSearch: &struct{}{}}},
	}

	return a.doGeminiRequest(ctx, apiKey, reqBody)
}

func (a *app) doGeminiRequest(ctx context.Context, apiKey string, reqBody geminiRequest) (string, error) {
	model := geminiModel()
	endpoint := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		url.PathEscape(model), apiKey,
	)

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("Gemini API error %d: %s", resp.StatusCode, string(respBody))
	}

	var gemRes geminiResponse
	if err := json.Unmarshal(respBody, &gemRes); err != nil {
		return "", fmt.Errorf("failed to parse Gemini response: %w", err)
	}
	if len(gemRes.Candidates) == 0 || len(gemRes.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("Gemini returned empty response")
	}

	return gemRes.Candidates[0].Content.Parts[0].Text, nil
}

// photoAppraise は写真からGemini Vision + Google Search grounding を用いて
// 商品を識別し、ウェブ上の相場を調査して価格を提案するエンドポイントです。
func (a *app) photoAppraise(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ImageBase64 string `json:"imageBase64"`
		MimeType    string `json:"mimeType"`
		Condition   string `json:"condition"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.ImageBase64 == "" {
		writeError(w, http.StatusBadRequest, "imageBase64 is required")
		return
	}
	if req.MimeType == "" {
		req.MimeType = "image/jpeg"
	}
	if req.Condition == "" {
		req.Condition = "良い"
	}

	// Step 1: Gemini Vision で商品を識別する（検索なし・JSON出力）
	visionPrompt := fmt.Sprintf(`この商品画像を詳細に分析してください。

以下のJSONフォーマット"のみ"で出力してください（マークダウンや説明文は不要）：
{
  "title": "商品名（ブランド・型番を含む具体的な名称）",
  "brand": "ブランド名（不明な場合は空文字）",
  "category": "以下のいずれか1つ: 家電・スマホ / 衣服・ファッション / 本・ゲーム・エンタメ / おもちゃ・ホビー / スポーツ・レジャー / ハンドメイド / その他",
  "estimatedCondition": "画像から見た状態の説明",
  "searchKeyword": "フリマサイト相場調査に使う最適な日本語検索キーワード"
}

商品の状態（ユーザー申告）: %s`, req.Condition)

	visionJSON, err := a.callGeminiVision(r.Context(), req.ImageBase64, req.MimeType, visionPrompt)
	if err != nil {
		writeError(w, http.StatusBadGateway, "商品識別に失敗しました: "+err.Error())
		return
	}

	// Step 1 のJSON をパース
	var visionResult struct {
		Title              string `json:"title"`
		Brand              string `json:"brand"`
		Category           string `json:"category"`
		EstimatedCondition string `json:"estimatedCondition"`
		SearchKeyword      string `json:"searchKeyword"`
	}
	cleanedJSON := extractJSON(visionJSON)
	if err := json.Unmarshal([]byte(cleanedJSON), &visionResult); err != nil {
		// パース失敗時はフォールバック
		visionResult.Title = "商品（詳細不明）"
		visionResult.Category = "その他"
		visionResult.SearchKeyword = "フリマ 商品"
	}

	// Step 2: Google Search grounding で日本のフリマ相場を調査
	searchPrompt := fmt.Sprintf(`日本のフリマアプリ（メルカリ、ヤフオク、ラクマ、PayPayフリマ等）で「%s」の現在の取引相場をGoogle検索で調べてください。

商品状態: %s（%s）

以下の情報を簡潔に日本語でまとめてください：
1. 相場価格帯（最安値〜最高値）
2. 平均的な取引価格
3. 状態による価格差
4. 推奨出品価格と最低許容価格

最後に以下のJSONブロックを出力してください：
<json>
{
  "price": 推奨出品価格（数値・円）,
  "minPrice": 最低許容価格（数値・円）,
  "maxPrice": 市場最高価格の目安（数値・円）,
  "reason": "価格提案の根拠（市場調査結果を含む50文字以内）",
  "searchSummary": "相場調査サマリー（100文字以内）"
}
</json>`,
		visionResult.SearchKeyword, req.Condition, visionResult.EstimatedCondition,
	)

	searchText, err := a.callGeminiSearch(r.Context(), searchPrompt)
	if err != nil {
		// 検索失敗時はVision結果のみで価格推定
		searchText = ""
	}

	// Step 2 の結果から JSON ブロックを抽出してパース
	var priceResult struct {
		Price         int    `json:"price"`
		MinPrice      int    `json:"minPrice"`
		MaxPrice      int    `json:"maxPrice"`
		Reason        string `json:"reason"`
		SearchSummary string `json:"searchSummary"`
	}

	priceJSON := extractTaggedJSON(searchText)
	if priceJSON == "" || json.Unmarshal([]byte(priceJSON), &priceResult) != nil {
		// フォールバック: カテゴリーに基づくデフォルト価格
		priceResult.Price = defaultPrice(visionResult.Category, req.Condition)
		priceResult.MinPrice = int(float64(priceResult.Price) * 0.7)
		priceResult.MaxPrice = int(float64(priceResult.Price) * 1.5)
		priceResult.Reason = "商品識別完了。相場データを取得できなかったため概算価格を設定しました。"
		priceResult.SearchSummary = searchText
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"title":         visionResult.Title,
		"brand":         visionResult.Brand,
		"category":      visionResult.Category,
		"condition":     req.Condition,
		"price":         priceResult.Price,
		"minPrice":      priceResult.MinPrice,
		"maxPrice":      priceResult.MaxPrice,
		"reason":        priceResult.Reason,
		"searchSummary": priceResult.SearchSummary,
	})
}

// extractJSON はGeminiのレスポンスから最初のJSONオブジェクトを抽出します。
func extractJSON(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start == -1 || end == -1 || end <= start {
		return s
	}
	return s[start : end+1]
}

// extractTaggedJSON は <json>...</json> タグで囲まれたJSONを抽出します。
// タグがない場合は extractJSON にフォールバックします。
func extractTaggedJSON(s string) string {
	const openTag = "<json>"
	const closeTag = "</json>"
	start := strings.Index(s, openTag)
	end := strings.Index(s, closeTag)
	if start != -1 && end != -1 && end > start {
		return strings.TrimSpace(s[start+len(openTag) : end])
	}
	return extractJSON(s)
}

// defaultPrice はカテゴリーと状態に基づくフォールバック価格を返します。
func defaultPrice(category, condition string) int {
	base := map[string]int{
		"家電・スマホ":     15000,
		"衣服・ファッション":  3000,
		"本・ゲーム・エンタメ": 1500,
		"おもちゃ・ホビー":   2000,
		"スポーツ・レジャー":  4000,
		"ハンドメイド":     2500,
		"その他":         2000,
	}
	price, ok := base[category]
	if !ok {
		price = 2000
	}
	multiplier := map[string]float64{
		"未使用・未開封": 1.0,
		"未使用に近い":  0.85,
		"良い":      0.7,
		"普通":      0.55,
		"傷・汚れあり":  0.35,
	}
	if m, ok := multiplier[condition]; ok {
		price = int(float64(price) * m)
	}
	return price
}
