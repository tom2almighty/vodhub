package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"vodhub/internal/store"
)

func (s *Server) handleListPublicSources(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"items": s.store.ListPublic(),
	})
}

func (s *Server) handleAdminListSources(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"sources":           s.store.List(),
		"customUpstreamUrl": s.store.CustomUpstreamURL(),
		"presets":           store.UpstreamPresets,
		"hasUpstreamProxy":  s.cms.HasUpstreamProxy(),
	})
}

func (s *Server) handleAdminSaveSources(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Sources           []store.VideoSource `json:"sources"`
		CustomUpstreamURL *string             `json:"customUpstreamUrl"`
	}
	if err := decodeJSONBody(r, 2*1024*1024, &body); err != nil || body.Sources == nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "请求体必须包含 sources 数组")
		return
	}

	saved, err := s.store.SaveAll(body.Sources, body.CustomUpstreamURL)
	if err != nil {
		s.logger.Error("save sources failed", "error", err)
		writeError(w, http.StatusInternalServerError, "SAVE_FAILED", "保存视频源失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sources":           saved,
		"customUpstreamUrl": s.store.CustomUpstreamURL(),
		"presets":           store.UpstreamPresets,
		"hasUpstreamProxy":  s.cms.HasUpstreamProxy(),
	})
}

func (s *Server) handleAdminSyncSources(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Preset string `json:"preset"`
		URL    string `json:"url"`
		Mode   string `json:"mode"`
	}
	if err := decodeJSONBody(r, 64*1024, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "请求体格式无效")
		return
	}

	targetURL := ""
	if body.Preset != "" {
		for _, p := range store.UpstreamPresets {
			if p.Key == body.Preset {
				targetURL = p.URL
				break
			}
		}
		if targetURL == "" {
			writeError(w, http.StatusBadRequest, "INVALID_PRESET", "未知的上游预设")
			return
		}
	} else if strings.TrimSpace(body.URL) != "" {
		targetURL = strings.TrimSpace(body.URL)
	} else {
		writeError(w, http.StatusBadRequest, "MISSING_TARGET", "请指定 preset 或 url")
		return
	}

	if !store.IsHTTPURL(targetURL) {
		writeError(w, http.StatusBadRequest, "INVALID_URL", "上游地址必须是合法的 http(s) URL")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	incoming, err := store.FetchUpstream(ctx, s.cms.DirectHTTPClient(), targetURL)
	if err != nil {
		writeError(w, http.StatusBadGateway, "UPSTREAM_FETCH_FAILED", err.Error())
		return
	}
	if len(incoming) == 0 {
		writeError(w, http.StatusBadRequest, "EMPTY_UPSTREAM", "上游未解析出有效视频源")
		return
	}

	mode := "merge"
	if body.Mode == "append" || body.Mode == "replace" {
		mode = body.Mode
	}

	merged, added, updated := store.MergeSources(s.store.List(), incoming, mode)
	var customPtr *string
	if strings.TrimSpace(body.URL) != "" {
		customPtr = &targetURL
	}
	saved, err := s.store.SaveAll(merged, customPtr)
	if err != nil {
		s.logger.Error("save synced sources failed", "error", err)
		writeError(w, http.StatusInternalServerError, "SAVE_FAILED", "保存同步结果失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sources":           saved,
		"added":             added,
		"updated":           updated,
		"customUpstreamUrl": s.store.CustomUpstreamURL(),
		"presets":           store.UpstreamPresets,
		"hasUpstreamProxy":  s.cms.HasUpstreamProxy(),
	})
}

func (s *Server) handleAdminImportSources(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Payload json.RawMessage `json:"payload"`
		Mode    string          `json:"mode"`
	}
	if err := decodeJSONBody(r, 4*1024*1024, &body); err != nil || len(body.Payload) == 0 {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "缺少导入数据")
		return
	}

	incoming, err := store.ParseSourcesPayload(body.Payload)
	if err != nil || len(incoming) == 0 {
		writeError(w, http.StatusBadRequest, "INVALID_SOURCES", "未解析出有效视频源")
		return
	}

	mode := "merge"
	if body.Mode == "append" || body.Mode == "replace" {
		mode = body.Mode
	}

	merged, added, updated := store.MergeSources(s.store.List(), incoming, mode)
	saved, err := s.store.SaveAll(merged, nil)
	if err != nil {
		s.logger.Error("save imported sources failed", "error", err)
		writeError(w, http.StatusInternalServerError, "SAVE_FAILED", "保存导入结果失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sources": saved,
		"added":   added,
		"updated": updated,
	})
}

func (s *Server) handleAdminProbeSource(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Source store.VideoSource `json:"source"`
	}
	if err := decodeJSONBody(r, 64*1024, &body); err != nil || body.Source.URL == "" {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "缺少 source 参数")
		return
	}

	probe := s.cms.Probe(r.Context(), body.Source)
	if body.Source.ID != "" {
		_ = s.store.UpdateProbe(body.Source.ID, probe)
	}
	writeJSON(w, http.StatusOK, map[string]any{"probe": probe})
}
