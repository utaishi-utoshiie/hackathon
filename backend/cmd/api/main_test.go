package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCallOpenAIJSONParsesChatCompletionContent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected authorization header: %q", got)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if body["response_format"] == nil {
			t.Fatal("expected response_format for JSON request")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"prohibited\":true,\"riskLevel\":\"high\",\"reasons\":[\"刃物の可能性\"],\"blockedKeywords\":[\"ナイフ\"]}"}}]}`))
	}))
	defer server.Close()

	a := &app{
		openAIKey:     "test-key",
		openAIModel:   "gpt-test",
		openAIBaseURL: server.URL,
		httpClient:    server.Client(),
	}
	var review itemReview
	if err := a.callOpenAIJSON(context.Background(), "JSONで返して", &review); err != nil {
		t.Fatalf("callOpenAIJSON returned error: %v", err)
	}
	if !review.Prohibited || review.RiskLevel != "high" {
		t.Fatalf("unexpected review: %+v", review)
	}
	if len(review.BlockedKeywords) != 1 || review.BlockedKeywords[0] != "ナイフ" {
		t.Fatalf("unexpected keywords: %+v", review.BlockedKeywords)
	}
}

func TestExtractJSONObjectFromFencedText(t *testing.T) {
	got := extractJSONObject("```json\n{\"price\":1200}\n```")
	if got != `{"price":1200}` {
		t.Fatalf("unexpected JSON extraction: %q", got)
	}
}

func TestNormalizeRiskLevel(t *testing.T) {
	if got := normalizeRiskLevel("HIGH", false); got != "high" {
		t.Fatalf("expected high, got %q", got)
	}
	if got := normalizeRiskLevel("unknown", true); got != "high" {
		t.Fatalf("expected high fallback for prohibited item, got %q", got)
	}
	if got := normalizeRiskLevel("", false); got != "low" {
		t.Fatalf("expected low fallback, got %q", got)
	}
}

func TestClampPrice(t *testing.T) {
	tests := []struct {
		name string
		in   int
		want int
	}{
		{name: "minimum", in: 1, want: 300},
		{name: "normal", in: 4800, want: 4800},
		{name: "maximum", in: 99999999, want: 9999999},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clampPrice(tt.in); got != tt.want {
				t.Fatalf("clampPrice(%d) = %d, want %d", tt.in, got, tt.want)
			}
		})
	}
}
