package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type ProbeStatus string

const (
	ProbeOK         ProbeStatus = "ok"
	ProbeFakeSearch ProbeStatus = "fake-search"
	ProbeEmpty      ProbeStatus = "empty"
	ProbeError      ProbeStatus = "error"
)

type ProbeInfo struct {
	Status    ProbeStatus `json:"status"`
	LatencyMs *int64      `json:"latencyMs"`
	Message   string      `json:"message"`
	CheckedAt string      `json:"checkedAt"`
}

type VideoSource struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	URL       string     `json:"url"`
	DetailURL string     `json:"detailUrl,omitempty"`
	Timeout   int        `json:"timeout,omitempty"`
	Retry     *int       `json:"retry,omitempty"`
	Weight    int        `json:"weight,omitempty"`
	IsEnabled bool       `json:"isEnabled"`
	UseProxy  bool       `json:"useProxy,omitempty"`
	Probe     *ProbeInfo `json:"probe,omitempty"`
}

type SourceOption struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	IsEnabled bool   `json:"isEnabled"`
	Weight    int    `json:"weight,omitempty"`
}

type UpstreamPreset struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	URL   string `json:"url"`
}

var UpstreamPresets = []UpstreamPreset{
	{
		Key:   "jin18",
		Label: "精简版 (jin18)",
		URL:   "https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jin18.json",
	},
	{
		Key:   "jingjian",
		Label: "精简版+成人 (jingjian)",
		URL:   "https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jingjian.json",
	},
	{
		Key:   "full",
		Label: "完整版 (full)",
		URL:   "https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/LunaTV-config.json",
	},
}

type persistedState struct {
	Sources           []VideoSource `json:"sources"`
	CustomUpstreamURL string        `json:"customUpstreamUrl,omitempty"`
	InitialSeedDone   bool          `json:"initialSeedDone,omitempty"`
	UpdatedAt         string        `json:"updatedAt,omitempty"`
}

// Store manages thread-safe atomic persistence of video sources in DATA_DIR/sources.json.
type Store struct {
	mu       sync.RWMutex
	filePath string
	state    persistedState
}

func Open(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	s := &Store{
		filePath: filepath.Join(dataDir, "sources.json"),
		state:    persistedState{Sources: []VideoSource{}},
	}
	if data, err := os.ReadFile(s.filePath); err == nil {
		var loaded persistedState
		if json.Unmarshal(data, &loaded) == nil {
			loaded.Sources = NormalizeList(loaded.Sources)
			s.state = loaded
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	return s, nil
}

func (s *Store) List() []VideoSource {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]VideoSource, len(s.state.Sources))
	copy(out, s.state.Sources)
	return out
}

func (s *Store) ListPublic() []SourceOption {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]SourceOption, len(s.state.Sources))
	for i, src := range s.state.Sources {
		out[i] = SourceOption{ID: src.ID, Name: src.Name, IsEnabled: src.IsEnabled, Weight: src.Weight}
	}
	return out
}

func (s *Store) CustomUpstreamURL() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state.CustomUpstreamURL
}

func (s *Store) Find(id string) (VideoSource, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, src := range s.state.Sources {
		if src.ID == id {
			return src, true
		}
	}
	return VideoSource{}, false
}

func (s *Store) SaveAll(sources []VideoSource, customUpstreamURL *string) ([]VideoSource, error) {
	clean := NormalizeList(sources)
	s.mu.Lock()
	defer s.mu.Unlock()

	s.state.Sources = clean
	s.state.InitialSeedDone = true
	if customUpstreamURL != nil {
		s.state.CustomUpstreamURL = strings.TrimSpace(*customUpstreamURL)
	}
	s.state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	if err := s.persistLocked(); err != nil {
		return nil, err
	}
	out := make([]VideoSource, len(clean))
	copy(out, clean)
	return out, nil
}

func (s *Store) UpdateProbe(id string, probe ProbeInfo) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	found := false
	for i := range s.state.Sources {
		if s.state.Sources[i].ID == id {
			p := probe
			s.state.Sources[i].Probe = &p
			found = true
			break
		}
	}
	if !found {
		return nil
	}
	s.state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.persistLocked()
}

// BootstrapIfEmpty runs a one-time seed from SOURCES_URL or SOURCES_JSON when
// no sources have been configured yet.
func (s *Store) BootstrapIfEmpty(ctx context.Context, client *http.Client, sourcesURL, sourcesJSON string) error {
	s.mu.RLock()
	skip := len(s.state.Sources) > 0 || s.state.InitialSeedDone
	s.mu.RUnlock()
	if skip {
		return nil
	}

	var seeded []VideoSource
	if sourcesURL != "" && IsHTTPURL(sourcesURL) {
		if items, err := FetchUpstream(ctx, client, sourcesURL); err == nil && len(items) > 0 {
			seeded = items
		}
	}
	if len(seeded) == 0 && sourcesJSON != "" {
		if items, err := ParseSourcesPayload([]byte(sourcesJSON)); err == nil && len(items) > 0 {
			seeded = items
		}
	}
	if len(seeded) == 0 {
		return nil
	}
	_, err := s.SaveAll(seeded, nil)
	return err
}

func (s *Store) persistLocked() error {
	raw, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := s.filePath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(raw); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, s.filePath)
}

func IsHTTPURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

func NormalizeList(list []VideoSource) []VideoSource {
	seen := make(map[string]struct{}, len(list))
	out := make([]VideoSource, 0, len(list))
	for _, raw := range list {
		id := strings.TrimSpace(raw.ID)
		u := strings.TrimSpace(raw.URL)
		if id == "" || !IsHTTPURL(u) {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}

		name := strings.TrimSpace(raw.Name)
		if name == "" {
			name = id
		}
		item := VideoSource{
			ID:        id,
			Name:      name,
			URL:       u,
			Weight:    raw.Weight,
			IsEnabled: raw.IsEnabled,
			UseProxy:  raw.UseProxy,
			Probe:     raw.Probe,
		}
		if detail := strings.TrimSpace(raw.DetailURL); detail != "" && IsHTTPURL(detail) {
			item.DetailURL = detail
		}
		if raw.Timeout > 0 {
			item.Timeout = raw.Timeout
		}
		if raw.Retry != nil && *raw.Retry >= 0 {
			v := *raw.Retry
			item.Retry = &v
		}
		out = append(out, item)
	}
	return out
}

// ParseSourcesPayload parses either an OuonNkiTV array or a LunaTV `{ api_site: { ... } }` object.
func ParseSourcesPayload(raw []byte) ([]VideoSource, error) {
	trimmed := strings.TrimSpace(strings.TrimPrefix(string(raw), "\uFEFF"))
	if trimmed == "" {
		return nil, errors.New("空 JSON 内容")
	}

	// Array format (OuonNkiTV)
	if strings.HasPrefix(trimmed, "[") {
		var items []struct {
			ID        string     `json:"id"`
			Name      string     `json:"name"`
			URL       string     `json:"url"`
			API       string     `json:"api"`
			DetailURL string     `json:"detailUrl"`
			Detail    string     `json:"detail"`
			Timeout   int        `json:"timeout"`
			Retry     *int       `json:"retry"`
			Weight    int        `json:"weight"`
			IsEnabled *bool      `json:"isEnabled"`
			UseProxy  bool       `json:"useProxy"`
			Probe     *ProbeInfo `json:"probe"`
		}
		if err := json.Unmarshal([]byte(trimmed), &items); err != nil {
			return nil, fmt.Errorf("JSON 格式无效: %w", err)
		}
		out := make([]VideoSource, 0, len(items))
		for _, it := range items {
			u := firstNonEmpty(it.URL, it.API)
			enabled := true
			if it.IsEnabled != nil {
				enabled = *it.IsEnabled
			}
			out = append(out, VideoSource{
				ID:        it.ID,
				Name:      it.Name,
				URL:       u,
				DetailURL: firstNonEmpty(it.DetailURL, it.Detail),
				Timeout:   it.Timeout,
				Retry:     it.Retry,
				Weight:    it.Weight,
				IsEnabled: enabled,
				UseProxy:  it.UseProxy,
				Probe:     it.Probe,
			})
		}
		return NormalizeList(out), nil
	}

	// Object format (LunaTV api_site)
	var envelope struct {
		APISite map[string]struct {
			Name      string `json:"name"`
			API       string `json:"api"`
			URL       string `json:"url"`
			Detail    string `json:"detail"`
			DetailURL string `json:"detailUrl"`
			IsEnabled *bool  `json:"isEnabled"`
		} `json:"api_site"`
	}
	if err := json.Unmarshal([]byte(trimmed), &envelope); err != nil {
		return nil, fmt.Errorf("JSON 格式无效: %w", err)
	}
	if len(envelope.APISite) == 0 {
		return nil, errors.New("未找到有效视频源字段")
	}

	out := make([]VideoSource, 0, len(envelope.APISite))
	for id, it := range envelope.APISite {
		enabled := true
		if it.IsEnabled != nil {
			enabled = *it.IsEnabled
		}
		out = append(out, VideoSource{
			ID:        id,
			Name:      it.Name,
			URL:       firstNonEmpty(it.API, it.URL),
			DetailURL: firstNonEmpty(it.Detail, it.DetailURL),
			IsEnabled: enabled,
		})
	}
	return NormalizeList(out), nil
}

func FetchUpstream(ctx context.Context, client *http.Client, targetURL string) ([]VideoSource, error) {
	if !IsHTTPURL(targetURL) {
		return nil, errors.New("上游地址必须是合法的 http(s) URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("User-Agent", "vodhub/2.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("拉取上游失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("拉取上游失败: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}
	return ParseSourcesPayload(body)
}

func MergeSources(existing, incoming []VideoSource, mode string) (merged []VideoSource, added int, updated int) {
	if mode == "replace" {
		return NormalizeList(incoming), len(incoming), 0
	}

	out := make([]VideoSource, len(existing))
	copy(out, existing)
	idxByID := make(map[string]int, len(out))
	for i, s := range out {
		idxByID[s.ID] = i
	}

	for _, item := range incoming {
		idx, exists := idxByID[item.ID]
		if !exists {
			idxByID[item.ID] = len(out)
			out = append(out, item)
			added++
			continue
		}
		if mode == "merge" {
			changed := false
			if out[idx].URL != item.URL {
				out[idx].URL = item.URL
				changed = true
			}
			if item.DetailURL != "" && out[idx].DetailURL != item.DetailURL {
				out[idx].DetailURL = item.DetailURL
				changed = true
			}
			if changed {
				updated++
			}
		}
	}
	return out, added, updated
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}
