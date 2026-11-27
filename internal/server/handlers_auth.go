package server

import (
	"net/http"
	"strconv"

	"vodhub/internal/auth"
)

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleSiteConfig(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=300")
	writeJSON(w, http.StatusOK, map[string]string{
		"siteName":          s.cfg.SiteName,
		"announcement":      s.cfg.Announcement,
		"announcementTitle": s.cfg.AnnouncementTitle,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.auth.Configured() {
		writeError(w, http.StatusInternalServerError, "AUTH_NOT_CONFIGURED", "服务端未配置 ADMIN_PASSWORD 或 AUTH_SECRET")
		return
	}

	ip := auth.ClientIP(r)
	if ok, retryAfter := s.auth.CheckRateLimit(ip); !ok {
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		writeError(w, http.StatusTooManyRequests, "RATE_LIMITED", "尝试次数过多，请稍后再试")
		return
	}

	var payload struct {
		Password string `json:"password"`
	}
	if err := decodeJSONBody(r, 8*1024, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "请求体格式无效")
		return
	}

	role, ok := s.auth.ResolveRole(payload.Password)
	if !ok {
		writeError(w, http.StatusUnauthorized, "INVALID_PASSWORD", "密码错误")
		return
	}

	token, err := s.auth.IssueToken(role)
	if err != nil {
		s.logger.Error("issue token failed", "error", err)
		writeError(w, http.StatusInternalServerError, "TOKEN_ISSUE_FAILED", "令牌签发失败")
		return
	}

	s.auth.ResetRateLimit(ip)
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"role":  role,
	})
}

func (s *Server) handleVerify(w http.ResponseWriter, r *http.Request) {
	role, ok := s.auth.RequestRole(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":   true,
		"role": role,
	})
}
