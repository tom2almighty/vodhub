package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleViewer Role = "viewer"
)

type tokenPayload struct {
	Sub Role  `json:"sub"`
	Iat int64 `json:"iat"`
	Exp int64 `json:"exp"`
}

// Service handles password verification, HMAC-SHA256 token issuance, and login rate limiting.
type Service struct {
	adminPassword  string
	accessPassword string
	secret         []byte
	ttl            time.Duration
	limiter        *rateLimiter
}

func NewService(adminPassword, accessPassword, secret string, ttl time.Duration) *Service {
	return &Service{
		adminPassword:  adminPassword,
		accessPassword: accessPassword,
		secret:         []byte(secret),
		ttl:            ttl,
		limiter:        newRateLimiter(10, 5*time.Minute),
	}
}

func (s *Service) Configured() bool {
	return s.adminPassword != "" && len(s.secret) > 0
}

func (s *Service) ResolveRole(password string) (Role, bool) {
	if s.adminPassword != "" && constantTimeEqual(password, s.adminPassword) {
		return RoleAdmin, true
	}
	if s.accessPassword != "" && constantTimeEqual(password, s.accessPassword) {
		return RoleViewer, true
	}
	return "", false
}

func (s *Service) IssueToken(role Role) (string, error) {
	if len(s.secret) == 0 {
		return "", errors.New("AUTH_SECRET 未配置")
	}
	now := time.Now().Unix()
	payload := tokenPayload{
		Sub: role,
		Iat: now,
		Exp: now + int64(s.ttl.Seconds()),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(raw)
	sig := s.sign(body)
	return body + "." + sig, nil
}

func (s *Service) VerifyToken(token string) (Role, bool) {
	if len(s.secret) == 0 || token == "" {
		return "", false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", false
	}
	expected := s.sign(parts[0])
	if !constantTimeEqual(parts[1], expected) {
		return "", false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", false
	}
	var payload tokenPayload
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return "", false
	}
	if payload.Exp <= time.Now().Unix() {
		return "", false
	}
	if payload.Sub != RoleAdmin && payload.Sub != RoleViewer {
		return "", false
	}
	return payload.Sub, true
}

func (s *Service) RequestRole(r *http.Request) (Role, bool) {
	return s.VerifyToken(ExtractToken(r))
}

func (s *Service) CheckRateLimit(ip string) (bool, int) {
	return s.limiter.check(ip)
}

func (s *Service) ResetRateLimit(ip string) {
	s.limiter.reset(ip)
}

func (s *Service) sign(body string) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func ExtractToken(r *http.Request) string {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(header) > 7 && strings.EqualFold(header[:7], "Bearer ") {
		if tok := strings.TrimSpace(header[7:]); tok != "" {
			return tok
		}
	}
	return strings.TrimSpace(r.URL.Query().Get("token"))
}

func ClientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if first, _, _ := strings.Cut(fwd, ","); strings.TrimSpace(first) != "" {
			return strings.TrimSpace(first)
		}
	}
	for _, h := range []string{"CF-Connecting-IP", "X-Real-IP"} {
		if v := strings.TrimSpace(r.Header.Get(h)); v != "" {
			return v
		}
	}
	if host, _, ok := strings.Cut(r.RemoteAddr, ":"); ok && host != "" {
		return host
	}
	return "unknown"
}

func constantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// ===== fixed-window login rate limiter =====

type bucket struct {
	count   int
	resetAt time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	buckets map[string]*bucket
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		limit:   limit,
		window:  window,
		buckets: make(map[string]*bucket),
	}
}

func (l *rateLimiter) check(key string) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	b, ok := l.buckets[key]
	if !ok || now.After(b.resetAt) {
		if len(l.buckets) >= 10000 {
			for k, v := range l.buckets {
				if now.After(v.resetAt) {
					delete(l.buckets, k)
				}
			}
		}
		l.buckets[key] = &bucket{count: 1, resetAt: now.Add(l.window)}
		return true, 0
	}
	b.count++
	if b.count > l.limit {
		retryAfter := int(time.Until(b.resetAt).Seconds()) + 1
		if retryAfter < 1 {
			retryAfter = 1
		}
		return false, retryAfter
	}
	return true, 0
}

func (l *rateLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.buckets, key)
}
