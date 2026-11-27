package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"vodhub/internal/cms"
	"vodhub/internal/store"
)

const (
	maxQueryRunes = 100
	maxSourceIDs  = 500
	maxCandidates = 50
)

func readSearchQuery(r *http.Request) string {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	runes := []rune(q)
	if len(runes) > maxQueryRunes {
		return string(runes[:maxQueryRunes])
	}
	return q
}

func parseIDSet(raw string) map[string]struct{} {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	if len(parts) > maxSourceIDs {
		parts = parts[:maxSourceIDs]
	}
	set := make(map[string]struct{}, len(parts))
	for _, p := range parts {
		if id := strings.TrimSpace(p); id != "" {
			set[id] = struct{}{}
		}
	}
	return set
}

func sliceToIDSet(list []string) map[string]struct{} {
	if len(list) == 0 {
		return nil
	}
	if len(list) > maxSourceIDs {
		list = list[:maxSourceIDs]
	}
	set := make(map[string]struct{}, len(list))
	for _, p := range list {
		if id := strings.TrimSpace(p); id != "" {
			set[id] = struct{}{}
		}
	}
	return set
}

func (s *Server) selectActiveSources(excluded, included map[string]struct{}) []store.VideoSource {
	all := s.store.List()
	active := make([]store.VideoSource, 0, len(all))
	for _, src := range all {
		_, isEx := excluded[src.ID]
		_, isIn := included[src.ID]
		if (src.IsEnabled || isIn) && !isEx {
			active = append(active, src)
		}
	}
	return active
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	query := readSearchQuery(r)
	if query == "" {
		writeError(w, http.StatusBadRequest, "MISSING_QUERY", "缺少搜索关键词")
		return
	}

	sources := s.selectActiveSources(
		parseIDSet(r.URL.Query().Get("exclude")),
		parseIDSet(r.URL.Query().Get("include")),
	)
	items := s.cms.AggregatedSearch(r.Context(), query, sources)
	if items == nil {
		items = []cms.SearchResult{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":            items,
		"totalSources":     len(sources),
		"completedSources": len(sources),
	})
}

func (s *Server) handleSearchStream(w http.ResponseWriter, r *http.Request) {
	query := readSearchQuery(r)
	if query == "" {
		writeError(w, http.StatusBadRequest, "MISSING_QUERY", "缺少搜索关键词")
		return
	}

	sources := s.selectActiveSources(
		parseIDSet(r.URL.Query().Get("exclude")),
		parseIDSet(r.URL.Query().Get("include")),
	)

	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, _ := w.(http.Flusher)
	enc := json.NewEncoder(w)

	send := func(event any) {
		_ = enc.Encode(event)
		if flusher != nil {
			flusher.Flush()
		}
	}

	send(map[string]any{"type": "start", "totalSources": len(sources)})
	if len(sources) == 0 {
		send(map[string]any{"type": "complete", "totalResults": 0, "completedSources": 0})
		return
	}

	totalResults, completed := s.cms.AggregatedSearchStream(
		r.Context(),
		query,
		sources,
		func(src store.VideoSource, items []cms.SearchResult) {
			send(map[string]any{
				"type":       "result",
				"items":      items,
				"sourceKey":  src.ID,
				"sourceName": src.Name,
			})
		},
		func(done, total int) {
			send(map[string]any{
				"type":      "progress",
				"completed": done,
				"total":     total,
			})
		},
	)

	send(map[string]any{
		"type":             "complete",
		"totalResults":     totalResults,
		"completedSources": completed,
	})
}

func (s *Server) handleDetail(w http.ResponseWriter, r *http.Request) {
	sourceID := strings.TrimSpace(r.URL.Query().Get("source"))
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if sourceID == "" || id == "" {
		writeError(w, http.StatusBadRequest, "MISSING_PARAMS", "缺少 source 或 id")
		return
	}

	src, ok := s.store.Find(sourceID)
	if !ok {
		writeError(w, http.StatusNotFound, "SOURCE_NOT_FOUND", "获取详情失败")
		return
	}

	detail, err := s.cms.GetDetail(r.Context(), src, id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "UPSTREAM_ERROR", "播放源暂时不可用，请稍后重试")
		return
	}
	if detail == nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "获取详情失败")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handlePlaySession(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Mode            string             `json:"mode"`
		Source          string             `json:"source"`
		ID              string             `json:"id"`
		Title           string             `json:"title"`
		Year            string             `json:"year"`
		Poster          string             `json:"poster"`
		SourceName      string             `json:"source_name"`
		Query           string             `json:"query"`
		PreferredSource string             `json:"preferredSource"`
		PreferredID     string             `json:"preferredId"`
		Candidates      []cms.SearchResult `json:"candidates"`
		Keyword         string             `json:"keyword"`
		ExcludedSources []string           `json:"excludedSources"`
		IncludedSources []string           `json:"includedSources"`
	}
	if err := decodeJSONBody(r, 256*1024, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "请求体格式无效")
		return
	}

	var candidates []cms.SearchResult
	switch payload.Mode {
	case "group":
		all := s.store.List()
		known := make(map[string]struct{}, len(all))
		for _, src := range all {
			known[src.ID] = struct{}{}
		}
		limit := min(len(payload.Candidates), maxCandidates)
		for _, cand := range payload.Candidates[:limit] {
			if cand.Source == "" || cand.ID == "" {
				continue
			}
			if _, ok := known[cand.Source]; !ok {
				continue
			}
			candidates = append(candidates, cand)
		}
		if len(candidates) == 0 {
			writeError(w, http.StatusBadRequest, "NO_CANDIDATES", "缺少候选播放源")
			return
		}
		candidates = cms.SortByRelevanceAndPriority(candidates, "", all)

	case "direct":
		if payload.Source == "" || payload.ID == "" {
			writeError(w, http.StatusBadRequest, "MISSING_PARAMS", "缺少 source 或 id")
			return
		}
		srcName := payload.SourceName
		if src, ok := s.store.Find(payload.Source); ok && srcName == "" {
			srcName = src.Name
		}
		if srcName == "" {
			srcName = payload.Source
		}
		candidates = []cms.SearchResult{{
			ID:             payload.ID,
			Title:          payload.Title,
			Poster:         payload.Poster,
			Source:         payload.Source,
			SourceName:     srcName,
			Year:           cms.NormalizeYear(payload.Year),
			Episodes:       []string{},
			EpisodesTitles: []string{},
		}}

	case "search":
		kw := strings.TrimSpace(payload.Keyword)
		if kw == "" {
			writeError(w, http.StatusBadRequest, "MISSING_KEYWORD", "缺少搜索关键词")
			return
		}
		sources := s.selectActiveSources(
			sliceToIDSet(payload.ExcludedSources),
			sliceToIDSet(payload.IncludedSources),
		)
		candidates = s.cms.AggregatedSearch(r.Context(), kw, sources)
		if len(candidates) == 0 {
			writeError(w, http.StatusBadRequest, "NO_MATCH", "未找到匹配播放源")
			return
		}

	default:
		writeError(w, http.StatusBadRequest, "INVALID_MODE", "无效的模式")
		return
	}

	chosen := candidates[0]
	for _, cand := range candidates {
		if cand.Source == payload.PreferredSource && cand.ID == payload.PreferredID {
			chosen = cand
			break
		}
	}

	resolved := chosen
	if len(chosen.Episodes) == 0 {
		if src, ok := s.store.Find(chosen.Source); ok {
			detail, err := s.cms.GetDetail(r.Context(), src, chosen.ID)
			if err != nil {
				writeError(w, http.StatusBadGateway, "UPSTREAM_ERROR", "播放源暂时不可用，请稍后重试")
				return
			}
			if detail != nil {
				resolved = *detail
			}
		}
	}

	title := strings.TrimSpace(payload.Title)
	if title == "" {
		title = strings.TrimSpace(resolved.Title)
	}
	if title == "" {
		title = strings.TrimSpace(candidates[0].Title)
	}
	year := cms.NormalizeYear(payload.Year)
	if year == "unknown" {
		year = cms.NormalizeYear(resolved.Year)
	}
	mediaType := "movie"
	if len(resolved.Episodes) > 1 {
		mediaType = "tv"
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"detail":            resolved,
		"available_sources": candidates,
		"search_title":      payload.Query,
		"current_source":    chosen.Source,
		"current_id":        chosen.ID,
		"title":             title,
		"year":              year,
		"type":              mediaType,
	})
}
