package server

import (
	"net/http"
	"strconv"
)

func (s *Server) handleRecommendations(w http.ResponseWriter, r *http.Request) {
	data, err := s.douban.Recommendations(r.Context())
	if err != nil {
		s.logger.Error("douban recommendations failed", "error", err)
		writeError(w, http.StatusBadGateway, "DOUBAN_ERROR", "获取推荐内容失败")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=604800, s-maxage=604800")
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleDoubanCategories(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "public, max-age=86400, s-maxage=86400")
	writeJSON(w, http.StatusOK, s.douban.Categories())
}

func (s *Server) handleDoubanCategory(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	if kind == "" {
		kind = "movie"
	}
	typ := r.URL.Query().Get("type")
	start, _ := strconv.Atoi(r.URL.Query().Get("start"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	data, err := s.douban.Category(r.Context(), kind, typ, start, limit)
	if err != nil {
		if err.Error() == "无效的 kind" {
			writeError(w, http.StatusBadRequest, "INVALID_KIND", "无效的 kind")
			return
		}
		s.logger.Error("douban category failed", "error", err)
		writeError(w, http.StatusBadGateway, "DOUBAN_ERROR", "获取分类列表失败")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=1800, s-maxage=1800")
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleImageProxy(w http.ResponseWriter, r *http.Request) {
	s.imgProxy.ServeHTTP(w, r)
}
