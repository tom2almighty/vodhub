package server

import (
	"compress/gzip"
	"encoding/json"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"vodhub/internal/auth"
	"vodhub/internal/cms"
	"vodhub/internal/config"
	"vodhub/internal/douban"
	"vodhub/internal/proxy"
	"vodhub/internal/store"
)

type Server struct {
	cfg      config.Config
	logger   *slog.Logger
	auth     *auth.Service
	store    *store.Store
	cms      *cms.Client
	douban   *douban.Service
	imgProxy *proxy.ImageProxy
	staticFS fs.FS
	mux      *http.ServeMux
}

func New(
	cfg config.Config,
	logger *slog.Logger,
	authSvc *auth.Service,
	srcStore *store.Store,
	cmsClient *cms.Client,
	doubanSvc *douban.Service,
	imgProxy *proxy.ImageProxy,
	staticFS fs.FS,
) *Server {
	s := &Server{
		cfg:      cfg,
		logger:   logger,
		auth:     authSvc,
		store:    srcStore,
		cms:      cmsClient,
		douban:   doubanSvc,
		imgProxy: imgProxy,
		staticFS: staticFS,
		mux:      http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.withRecover(s.withLogging(s.withCORS(s.withGzip(s.mux))))
}

func (s *Server) registerRoutes() {
	// Public routes
	s.mux.HandleFunc("GET /api/health", s.handleHealth)
	s.mux.HandleFunc("GET /api/site-config", s.handleSiteConfig)
	s.mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	s.mux.HandleFunc("GET /api/auth/verify", s.handleVerify)

	// Authenticated routes (admin + viewer)
	s.mux.Handle("GET /api/sources", s.requireAuth(http.HandlerFunc(s.handleListPublicSources)))
	s.mux.Handle("GET /api/search-stream", s.requireAuth(http.HandlerFunc(s.handleSearchStream)))
	s.mux.Handle("GET /api/search", s.requireAuth(http.HandlerFunc(s.handleSearch)))
	s.mux.Handle("GET /api/detail", s.requireAuth(http.HandlerFunc(s.handleDetail)))
	s.mux.Handle("POST /api/play-session", s.requireAuth(http.HandlerFunc(s.handlePlaySession)))
	s.mux.Handle("GET /api/recommendations", s.requireAuth(http.HandlerFunc(s.handleRecommendations)))
	s.mux.Handle("GET /api/douban/categories", s.requireAuth(http.HandlerFunc(s.handleDoubanCategories)))
	s.mux.Handle("GET /api/douban/category", s.requireAuth(http.HandlerFunc(s.handleDoubanCategory)))
	s.mux.Handle("GET /api/image", s.requireAuth(http.HandlerFunc(s.handleImageProxy)))

	// Admin-only routes
	s.mux.Handle("GET /api/admin/sources", s.requireAdmin(http.HandlerFunc(s.handleAdminListSources)))
	s.mux.Handle("PUT /api/admin/sources", s.requireAdmin(http.HandlerFunc(s.handleAdminSaveSources)))
	s.mux.Handle("POST /api/admin/sources/sync", s.requireAdmin(http.HandlerFunc(s.handleAdminSyncSources)))
	s.mux.Handle("POST /api/admin/sources/import", s.requireAdmin(http.HandlerFunc(s.handleAdminImportSources)))
	s.mux.Handle("POST /api/admin/sources/probe", s.requireAdmin(http.HandlerFunc(s.handleAdminProbeSource)))

	// Catch-all for unknown /api paths
	s.mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "接口不存在")
	})

	// Embedded SPA static files + fallback
	s.mux.HandleFunc("/", s.handleSPA)
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := s.auth.RequestRole(r); !ok {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
			return
		}
		if w.Header().Get("Cache-Control") == "" {
			w.Header().Set("Cache-Control", "private, no-store")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, ok := s.auth.RequestRole(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
			return
		}
		if role != auth.RoleAdmin {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "需要管理员权限")
			return
		}
		w.Header().Set("Cache-Control", "private, no-store")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleSPA(w http.ResponseWriter, r *http.Request) {
	if s.staticFS == nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "前端资源未构建")
		return
	}

	cleaned := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if cleaned == "" {
		cleaned = "index.html"
	}

	// Serve existing static file directly; fall back to index.html for SPA routes.
	if f, err := s.staticFS.Open(cleaned); err == nil {
		stat, statErr := f.Stat()
		_ = f.Close()
		if statErr == nil && !stat.IsDir() {
			if strings.HasPrefix(cleaned, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			http.FileServerFS(s.staticFS).ServeHTTP(w, r)
			return
		}
	}

	indexBytes, err := fs.ReadFile(s.staticFS, "index.html")
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "index.html 不存在")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(indexBytes)
}

// ===== JSON helpers (consistent `{ code, message }` error envelope) =====

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{
		"code":    code,
		"message": message,
	})
}

func decodeJSONBody(r *http.Request, maxBytes int64, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, maxBytes))
	return dec.Decode(dst)
}

// ===== middleware =====

func (s *Server) withRecover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				s.logger.Error("panic recovered", "error", rec, "path", r.URL.Path)
				writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "服务器内部错误")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

func (sr *statusRecorder) Flush() {
	if fl, ok := sr.ResponseWriter.(http.Flusher); ok {
		fl.Flush()
	}
}

func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		s.logger.Info("http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"ip", auth.ClientIP(r),
		)
	})
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "86400")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

type gzipResponseWriter struct {
	http.ResponseWriter
	gz *gzip.Writer
}

func (g *gzipResponseWriter) Write(p []byte) (int, error) {
	return g.gz.Write(p)
}

func (s *Server) withGzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Never buffer streaming NDJSON or re-compress images.
		if r.URL.Path == "/api/search-stream" || r.URL.Path == "/api/image" ||
			!strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Add("Vary", "Accept-Encoding")
		gz := gzip.NewWriter(w)
		defer gz.Close()
		next.ServeHTTP(&gzipResponseWriter{ResponseWriter: w, gz: gz}, r)
	})
}
