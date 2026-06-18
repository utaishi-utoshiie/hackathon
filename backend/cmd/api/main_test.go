package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTokenPreservesAvatarURL(t *testing.T) {
	a := &app{jwtSecret: "test-secret"}
	want := user{ID: 7, Name: "Toshi", Email: "toshi@example.com", Role: "user", AvatarURL: "https://example.com/avatar.png"}
	got, err := a.verifyToken(a.signToken(want))
	if err != nil {
		t.Fatalf("verifyToken returned error: %v", err)
	}
	if got.AvatarURL != want.AvatarURL {
		t.Fatalf("avatar URL = %q, want %q", got.AvatarURL, want.AvatarURL)
	}
}

func TestParseGCSRef(t *testing.T) {
	bucket, objectName, err := parseGCSRef("gcs://nextmarket/avatars/user-1.jpg")
	if err != nil {
		t.Fatalf("parseGCSRef returned error: %v", err)
	}
	if bucket != "nextmarket" || objectName != "avatars/user-1.jpg" {
		t.Fatalf("unexpected parse result: bucket=%q object=%q", bucket, objectName)
	}
}

func TestRequireAdminMiddleware(t *testing.T) {
	a := &app{jwtSecret: "test-secret"}

	handler := a.requireAuth(a.requireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})))

	// Case 1: Unauthorized (no token)
	{
		req := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rec.Code)
		}
	}

	// Case 2: Forbidden (non-admin token)
	{
		token := a.signToken(user{ID: 1, Name: "User", Email: "user@example.com", Role: "user"})
		req := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", rec.Code)
		}
	}

	// Case 3: Success (admin token)
	{
		token := a.signToken(user{ID: 2, Name: "Admin", Email: "admin@example.com", Role: "admin"})
		req := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		if got := rec.Body.String(); got != "ok" {
			t.Fatalf("expected 'ok', got %q", got)
		}
	}
}

func TestFormatHistory(t *testing.T) {
	history := []map[string]any{
		{"speaker": "buyer", "text": "2200円になりますか？", "price": 2200, "action": "offer"},
		{"speaker": "seller", "text": "2500円ならいいですよ", "price": 2500, "action": "offer"},
	}
	got := formatHistory(history)
	if !strings.Contains(got, "buyer: 「2200円になりますか？」") {
		t.Fatalf("unexpected format result: %q", got)
	}
	if !strings.Contains(got, "seller: 「2500円ならいいですよ」") {
		t.Fatalf("unexpected format result: %q", got)
	}
}

// Benchmark the GCS Reference string parsing algorithm
func BenchmarkParseGCSRef(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_, _, _ = parseGCSRef("gcs://nextmarket/avatars/user-1.jpg")
	}
}

// Benchmark the HMAC-SHA256 JWT Token Signing operation (Cryptographic speed)
func BenchmarkSignToken(b *testing.B) {
	a := &app{jwtSecret: "test-secret"}
	u := user{ID: 9999, Name: "BenchmarkUser", Email: "bench@example.com", Role: "user", AvatarURL: "https://example.com/avatar.png"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = a.signToken(u)
	}
}

// Benchmark the Token Verification (signature + json decode parsing)
func BenchmarkVerifyToken(b *testing.B) {
	a := &app{jwtSecret: "test-secret"}
	u := user{ID: 9999, Name: "BenchmarkUser", Email: "bench@example.com", Role: "user", AvatarURL: "https://example.com/avatar.png"}
	token := a.signToken(u)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = a.verifyToken(token)
	}
}

// Benchmark History string construction
func BenchmarkFormatHistory(b *testing.B) {
	history := []map[string]any{
		{"speaker": "buyer", "text": "2200円になりますか？", "price": 2200, "action": "offer"},
		{"speaker": "seller", "text": "2500円ならいいですよ", "price": 2500, "action": "offer"},
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = formatHistory(history)
	}
}

