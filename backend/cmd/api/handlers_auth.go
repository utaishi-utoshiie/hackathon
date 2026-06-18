package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

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

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name cannot be empty")
		return
	}

	_, err := a.dbHandle().ExecContext(r.Context(),
		"UPDATE users SET name = ?, avatar_url = ? WHERE id = ?",
		req.Name, req.AvatarURL, u.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
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
		return user{}, errors.New("invalid token format")
	}
	unsigned := parts[0] + "." + parts[1]
	signature := parts[2]
	if !hmac.Equal([]byte(signature), []byte(hmacSHA256(unsigned, a.jwtSecret))) {
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

func (a *app) changePassword(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req struct {
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}

	hashed := a.hashPassword(req.Password)
	_, err := a.dbHandle().ExecContext(r.Context(),
		"UPDATE users SET password_hash = ? WHERE id = ?",
		hashed, u.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update password")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "message": "パスワードを正常に更新しました"})
}

func (a *app) resetPasswordDemo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "email cannot be empty and password must be at least 6 characters")
		return
	}

	hashed := a.hashPassword(req.Password)
	db := a.dbHandle()

	// Check if user exists
	var id int64
	err := db.QueryRowContext(r.Context(), "SELECT id FROM users WHERE email = ?", email).Scan(&id)
	if err == sql.ErrNoRows {
		// Does not exist, register them on the fly!
		res, err := db.ExecContext(r.Context(),
			"INSERT INTO users (name, email, password_hash, role) VALUES ('DemoUser', ?, ?, 'user')",
			email, hashed,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to auto-register demo user: "+err.Error())
			return
		}
		newID, _ := res.LastInsertId()
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "success",
			"message": fmt.Sprintf("アカウント '%s' が存在しないため、パスワード '%s' で新規自動登録しました！そのままログインしてください。", email, req.Password),
			"userId":  newID,
		})
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}

	// Exists, overwrite password_hash directly!
	_, err = db.ExecContext(r.Context(), "UPDATE users SET password_hash = ? WHERE id = ?", hashed, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update password: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"message": fmt.Sprintf("アカウント '%s' のパスワードを '%s' に強制上書きしました！そのままログインしてください。", email, req.Password),
		"userId":  id,
	})
}
