package cms

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/net/proxy"

	"vodhub/internal/store"
)

const (
	defaultSourceTimeout = 10 * time.Second
	defaultRetryCount    = 1
	maxAPIResponseBytes  = 8 * 1024 * 1024
	browserUA            = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

var (
	yearPattern    = regexp.MustCompile(`\d{4}`)
	validIDPattern = regexp.MustCompile(`^[\w-]+$`)
)

// SearchResult is the normalized video item returned by search and detail APIs.
type SearchResult struct {
	ID             string   `json:"id"`
	Title          string   `json:"title"`
	Poster         string   `json:"poster"`
	Source         string   `json:"source"`
	SourceName     string   `json:"source_name"`
	Year           string   `json:"year"`
	Episodes       []string `json:"episodes"`
	EpisodesTitles []string `json:"episodes_titles"`
	Class          string   `json:"class"`
	Desc           string   `json:"desc"`
	TypeName       string   `json:"type_name"`
	DoubanID       int      `json:"douban_id"`
	Score          string   `json:"score"`
	Actors         string   `json:"actors"`
	Directors      string   `json:"directors"`
	Area           string   `json:"area"`
	Lang           string   `json:"lang"`
	Remark         string   `json:"remark"`
}

// FlexString accepts JSON strings, numbers, or null without failing decode.
type FlexString string

func (f *FlexString) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		*f = ""
		return nil
	}
	if trimmed[0] == '"' {
		var s string
		if err := json.Unmarshal(trimmed, &s); err != nil {
			return err
		}
		*f = FlexString(s)
		return nil
	}
	*f = FlexString(string(trimmed))
	return nil
}

type rawCMSResponse struct {
	List []rawCMSItem `json:"list"`
}

type rawCMSItem struct {
	VodID          FlexString `json:"vod_id"`
	VodName        FlexString `json:"vod_name"`
	VodPic         FlexString `json:"vod_pic"`
	VodYear        FlexString `json:"vod_year"`
	VodPlayURL     FlexString `json:"vod_play_url"`
	VodPlayFrom    FlexString `json:"vod_play_from"`
	VodContent     FlexString `json:"vod_content"`
	TypeName       FlexString `json:"type_name"`
	VodDoubanID    FlexString `json:"vod_douban_id"`
	VodDoubanScore FlexString `json:"vod_douban_score"`
	VodActor       FlexString `json:"vod_actor"`
	VodDirector    FlexString `json:"vod_director"`
	VodArea        FlexString `json:"vod_area"`
	VodRemarks     FlexString `json:"vod_remarks"`
}

// Client queries MacCMS JSON APIs concurrently with per-source proxy opt-in.
// Video playback streams are never proxied — only lightweight API metadata requests.
type Client struct {
	directClient  *http.Client
	proxyClient   *http.Client
	hasProxy      bool
	concurrency   int
	searchTimeout time.Duration
}

func NewClient(concurrency int, searchTimeout time.Duration, upstreamProxy string) *Client {
	directTransport := &http.Transport{
		DialContext:           (&net.Dialer{Timeout: 6 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   6 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	c := &Client{
		directClient:  &http.Client{Transport: directTransport},
		concurrency:   max(1, concurrency),
		searchTimeout: searchTimeout,
	}

	if proxyTransport, ok := buildProxyTransport(upstreamProxy); ok {
		c.proxyClient = &http.Client{Transport: proxyTransport}
		c.hasProxy = true
	}

	return c
}

func (c *Client) HasUpstreamProxy() bool {
	return c.hasProxy
}

func (c *Client) DirectHTTPClient() *http.Client {
	return c.directClient
}

func (c *Client) clientFor(src store.VideoSource) *http.Client {
	if src.UseProxy && c.proxyClient != nil {
		return c.proxyClient
	}
	return c.directClient
}

func buildProxyTransport(raw string) (*http.Transport, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return nil, false
	}

	base := &http.Transport{
		MaxIdleConns:          60,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   8 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	switch strings.ToLower(u.Scheme) {
	case "http", "https":
		base.Proxy = http.ProxyURL(u)
		return base, true
	case "socks5", "socks5h":
		var auth *proxy.Auth
		if u.User != nil {
			pwd, _ := u.User.Password()
			auth = &proxy.Auth{User: u.User.Username(), Password: pwd}
		}
		dialer, err := proxy.SOCKS5("tcp", u.Host, auth, &net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second})
		if err != nil {
			return nil, false
		}
		if ctxDialer, ok := dialer.(proxy.ContextDialer); ok {
			base.DialContext = ctxDialer.DialContext
		} else {
			base.DialContext = func(_ context.Context, network, addr string) (net.Conn, error) {
				return dialer.Dial(network, addr)
			}
		}
		return base, true
	default:
		return nil, false
	}
}

func BuildSearchURL(baseURL, query string, page int) string {
	q := url.QueryEscape(query)
	if page > 1 {
		q += "&pg=" + strconv.Itoa(page)
	}
	return buildAPIURL(baseURL, "/api.php/provide/vod/?ac=videolist&wd=", q)
}

func BuildDetailURL(baseURL, id string) string {
	return buildAPIURL(baseURL, "/api.php/provide/vod/?ac=videolist&ids=", url.QueryEscape(id))
}

func buildAPIURL(baseURL, configPath, queryValue string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	pathPart, queryPart, _ := strings.Cut(configPath, "?")
	cleanPath := strings.ToLower(strings.TrimRight(pathPart, "/"))
	lower := strings.ToLower(trimmed)

	// Keep custom paths like `/provide/vod/from/.../at/json` or `/api.php/provide/vod` intact.
	if strings.HasSuffix(lower, cleanPath) ||
		strings.Contains(lower, "/api.php/provide/vod") ||
		strings.Contains(lower, "/provide/vod") {
		sep := "?"
		if strings.Contains(trimmed, "?") {
			sep = "&"
		}
		return trimmed + sep + queryPart + queryValue
	}
	return trimmed + configPath + queryValue
}

func NormalizeYear(raw string) string {
	if m := yearPattern.FindString(raw); m != "" {
		return m
	}
	return "unknown"
}

// ParsePlayURL parses MacCMS `vod_play_url` (`$$$` groups, `#` episodes, `$` name/url),
// preferring m3u8 lines and falling back to the last playable line.
func ParsePlayURL(vodPlayURL, vodPlayFrom string) (urls []string, names []string) {
	if strings.TrimSpace(vodPlayURL) == "" {
		return []string{}, []string{}
	}

	playSources := strings.Split(vodPlayURL, "$$$")
	playFroms := strings.Split(vodPlayFrom, "$$$")

	chosen := -1
	for i, from := range playFroms {
		if i < len(playSources) && strings.Contains(strings.ToLower(from), "m3u8") {
			chosen = i
			break
		}
	}
	if chosen == -1 {
		// Fall back to any group containing .m3u8 URLs, else the last group.
		for i, grp := range playSources {
			if strings.Contains(strings.ToLower(grp), ".m3u8") {
				chosen = i
				break
			}
		}
	}
	if chosen == -1 {
		chosen = len(playSources) - 1
	}

	episodes := strings.Split(playSources[chosen], "#")
	urls = make([]string, 0, len(episodes))
	names = make([]string, 0, len(episodes))

	for idx, ep := range episodes {
		ep = strings.TrimSpace(ep)
		if ep == "" {
			continue
		}
		var title, playURL string
		if before, after, ok := strings.Cut(ep, "$"); ok {
			title = strings.TrimSpace(before)
			playURL = strings.TrimSpace(after)
		} else {
			playURL = ep
		}
		if !strings.HasPrefix(playURL, "http://") && !strings.HasPrefix(playURL, "https://") {
			continue
		}
		if title == "" {
			title = fmt.Sprintf("第%d集", idx+1)
		}
		urls = append(urls, playURL)
		names = append(names, title)
	}
	return urls, names
}

func mapItem(raw rawCMSItem, src store.VideoSource) SearchResult {
	urls, names := ParsePlayURL(string(raw.VodPlayURL), string(raw.VodPlayFrom))
	doubanID, _ := strconv.Atoi(strings.TrimSpace(string(raw.VodDoubanID)))
	return SearchResult{
		ID:             strings.TrimSpace(string(raw.VodID)),
		Title:          strings.TrimSpace(string(raw.VodName)),
		Poster:         strings.TrimSpace(string(raw.VodPic)),
		Source:         src.ID,
		SourceName:     src.Name,
		Year:           NormalizeYear(string(raw.VodYear)),
		Episodes:       urls,
		EpisodesTitles: names,
		Desc:           string(raw.VodContent),
		TypeName:       string(raw.TypeName),
		DoubanID:       doubanID,
		Score:          strings.TrimSpace(string(raw.VodDoubanScore)),
		Actors:         string(raw.VodActor),
		Directors:      string(raw.VodDirector),
		Area:           string(raw.VodArea),
		Remark:         string(raw.VodRemarks),
	}
}

func (c *Client) fetchCMSList(ctx context.Context, src store.VideoSource, targetURL string, overrideRetry *int) ([]rawCMSItem, error) {
	timeout := defaultSourceTimeout
	if src.Timeout > 0 {
		timeout = time.Duration(src.Timeout) * time.Millisecond
	}
	retries := defaultRetryCount
	if src.Retry != nil {
		retries = *src.Retry
	}
	if overrideRetry != nil {
		retries = *overrideRetry
	}

	httpClient := c.clientFor(src)
	var lastErr error

	for attempt := 0; attempt <= retries; attempt++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		reqCtx, cancel := context.WithTimeout(ctx, timeout)
		req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, targetURL, nil)
		if err != nil {
			cancel()
			return nil, err
		}
		req.Header.Set("User-Agent", browserUA)
		req.Header.Set("Accept", "application/json, text/plain, */*")

		resp, err := httpClient.Do(req)
		if err != nil {
			cancel()
			lastErr = err
			continue
		}

		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxAPIResponseBytes))
		_ = resp.Body.Close()
		cancel()

		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
		}

		// Strip UTF-8 BOM and surrounding whitespace before JSON decoding.
		cleaned := bytes.TrimSpace(bytes.TrimPrefix(body, []byte{0xEF, 0xBB, 0xBF}))
		if len(cleaned) == 0 || cleaned[0] != '{' {
			return nil, errors.New("返回非 JSON（可能被拦截或接口失效）")
		}

		var parsed rawCMSResponse
		if err := json.Unmarshal(cleaned, &parsed); err != nil {
			return nil, fmt.Errorf("JSON 解析失败: %w", err)
		}
		if parsed.List == nil {
			return nil, errors.New("响应缺少 list 数组")
		}
		return parsed.List, nil
	}

	if lastErr == nil {
		lastErr = errors.New("请求失败")
	}
	return nil, lastErr
}

// SearchSourceRaw queries a single source without relevance filtering (used by probe).
func (c *Client) SearchSourceRaw(ctx context.Context, query string, src store.VideoSource, retries int) ([]SearchResult, error) {
	raw, err := c.fetchCMSList(ctx, src, BuildSearchURL(src.URL, query, 1), &retries)
	if err != nil {
		return nil, err
	}
	out := make([]SearchResult, 0, len(raw))
	for _, it := range raw {
		out = append(out, mapItem(it, src))
	}
	return out, nil
}

// GetDetail fetches a single video's episodes and metadata from its source.
func (c *Client) GetDetail(ctx context.Context, src store.VideoSource, id string) (*SearchResult, error) {
	if id == "" || !validIDPattern.MatchString(id) {
		return nil, errors.New("无效的视频 ID")
	}
	baseURL := src.DetailURL
	if baseURL == "" {
		baseURL = src.URL
	}
	raw, err := c.fetchCMSList(ctx, src, BuildDetailURL(baseURL, id), nil)
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, nil
	}
	mapped := mapItem(raw[0], src)
	if mapped.ID == "" {
		mapped.ID = id
	}
	return &mapped, nil
}

// AggregatedSearchStream queries all selected sources concurrently with a bounded
// worker pool and overall deadline, invoking callbacks safely as each source finishes.
func (c *Client) AggregatedSearchStream(
	ctx context.Context,
	query string,
	sources []store.VideoSource,
	onResult func(src store.VideoSource, items []SearchResult),
	onProgress func(completed, total int),
) (totalResults int, completedSources int) {
	if query == "" || len(sources) == 0 {
		return 0, 0
	}

	searchCtx := ctx
	var cancel context.CancelFunc
	if c.searchTimeout > 0 {
		searchCtx, cancel = context.WithTimeout(ctx, c.searchTimeout)
		defer cancel()
	}

	sem := make(chan struct{}, c.concurrency)
	var (
		wg        sync.WaitGroup
		cbMu      sync.Mutex
		completed atomic.Int64
		totalHits atomic.Int64
	)

	total := len(sources)
	for _, src := range sources {
		wg.Add(1)
		go func(s store.VideoSource) {
			defer wg.Done()

			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-searchCtx.Done():
				return
			}

			raw, err := c.fetchCMSList(searchCtx, s, BuildSearchURL(s.URL, query, 1), nil)
			if err == nil && len(raw) > 0 {
				mapped := make([]SearchResult, 0, len(raw))
				for _, item := range raw {
					mapped = append(mapped, mapItem(item, s))
				}
				relevant := FilterRelevant(mapped, query)
				if len(relevant) > 0 {
					totalHits.Add(int64(len(relevant)))
					if onResult != nil {
						cbMu.Lock()
						onResult(s, relevant)
						cbMu.Unlock()
					}
				}
			}

			done := int(completed.Add(1))
			if onProgress != nil {
				cbMu.Lock()
				onProgress(done, total)
				cbMu.Unlock()
			}
		}(src)
	}

	wg.Wait()
	return int(totalHits.Load()), int(completed.Load())
}

// AggregatedSearch collects all relevant items across sources and sorts them by relevance.
func (c *Client) AggregatedSearch(ctx context.Context, query string, sources []store.VideoSource) []SearchResult {
	var (
		mu  sync.Mutex
		all []SearchResult
	)
	c.AggregatedSearchStream(ctx, query, sources, func(_ store.VideoSource, items []SearchResult) {
		mu.Lock()
		all = append(all, items...)
		mu.Unlock()
	}, nil)
	return SortByRelevance(all, query)
}
