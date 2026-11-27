package douban

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"sync"
	"time"
)

const (
	doubanBaseURL   = "https://m.douban.com"
	fetchTimeout    = 10 * time.Second
	cacheTTL        = 7 * 24 * time.Hour
	maxCacheSize    = 200
	defaultLimit    = 18
	maxLimit        = 50
	maxStart        = 5000
	doubanUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

var yearRe = regexp.MustCompile(`(\d{4})`)

type RecommendationItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Poster      string `json:"poster"`
	Year        string `json:"year"`
	Rating      string `json:"rating"`
	ExternalURL string `json:"externalUrl,omitempty"`
}

type HomeRecommendations struct {
	Movies       []RecommendationItem `json:"movies"`
	TVShows      []RecommendationItem `json:"tvShows"`
	VarietyShows []RecommendationItem `json:"varietyShows"`
}

type CategoryResult struct {
	Items []RecommendationItem `json:"items"`
	Total int                  `json:"total"`
}

type Categories struct {
	Movie []string `json:"movie"`
	TV    []string `json:"tv"`
	Show  []string `json:"show"`
}

type hotSpec struct {
	kind     string
	category string
	typ      string
}

var (
	movieOrder = []string{"全部", "华语", "欧美", "韩国", "日本"}
	movieTypes = map[string]hotSpec{
		"全部": {kind: "movie", category: "热门", typ: "全部"},
		"华语": {kind: "movie", category: "热门", typ: "华语"},
		"欧美": {kind: "movie", category: "热门", typ: "欧美"},
		"韩国": {kind: "movie", category: "热门", typ: "韩国"},
		"日本": {kind: "movie", category: "热门", typ: "日本"},
	}

	tvOrder = []string{"综合", "国产剧", "欧美剧", "日剧", "韩剧", "动画", "纪录片"}
	tvTypes = map[string]hotSpec{
		"综合":  {kind: "tv", category: "tv", typ: "tv"},
		"国产剧": {kind: "tv", category: "tv", typ: "tv_domestic"},
		"欧美剧": {kind: "tv", category: "tv", typ: "tv_american"},
		"日剧":  {kind: "tv", category: "tv", typ: "tv_japanese"},
		"韩剧":  {kind: "tv", category: "tv", typ: "tv_korean"},
		"动画":  {kind: "tv", category: "tv", typ: "tv_animation"},
		"纪录片": {kind: "tv", category: "tv", typ: "tv_documentary"},
	}

	showOrder = []string{"综合", "国内", "国外"}
	showTypes = map[string]hotSpec{
		"综合": {kind: "tv", category: "show", typ: "show"},
		"国内": {kind: "tv", category: "show", typ: "show_domestic"},
		"国外": {kind: "tv", category: "show", typ: "show_foreign"},
	}
)

type cacheEntry struct {
	val       CategoryResult
	expiresAt time.Time
}

type inflightCall struct {
	done chan struct{}
	val  CategoryResult
	err  error
}

type Service struct {
	client   *http.Client
	mu       sync.Mutex
	cache    map[string]cacheEntry
	inflight map[string]*inflightCall
}

func NewService(client *http.Client) *Service {
	return &Service{
		client:   client,
		cache:    make(map[string]cacheEntry),
		inflight: make(map[string]*inflightCall),
	}
}

func (s *Service) Categories() Categories {
	return Categories{
		Movie: movieOrder,
		TV:    tvOrder,
		Show:  showOrder,
	}
}

func (s *Service) Recommendations(ctx context.Context) (HomeRecommendations, error) {
	var (
		wg               sync.WaitGroup
		movies, tv, show CategoryResult
		errM, errT, errS error
	)

	wg.Add(3)
	go func() {
		defer wg.Done()
		movies, errM = s.fetchHot(ctx, movieTypes["全部"], 0, defaultLimit)
	}()
	go func() {
		defer wg.Done()
		tv, errT = s.fetchHot(ctx, tvTypes["综合"], 0, defaultLimit)
	}()
	go func() {
		defer wg.Done()
		show, errS = s.fetchHot(ctx, showTypes["综合"], 0, defaultLimit)
	}()
	wg.Wait()

	if errM != nil {
		return HomeRecommendations{}, errM
	}
	if errT != nil {
		return HomeRecommendations{}, errT
	}
	if errS != nil {
		return HomeRecommendations{}, errS
	}

	return HomeRecommendations{
		Movies:       movies.Items,
		TVShows:      tv.Items,
		VarietyShows: show.Items,
	}, nil
}

func (s *Service) Category(ctx context.Context, kind, typ string, start, limit int) (CategoryResult, error) {
	var (
		spec hotSpec
		ok   bool
	)
	switch kind {
	case "movie":
		spec, ok = movieTypes[typ]
		if !ok {
			spec = movieTypes["全部"]
		}
	case "tv":
		spec, ok = tvTypes[typ]
		if !ok {
			spec = tvTypes["综合"]
		}
	case "show":
		spec, ok = showTypes[typ]
		if !ok {
			spec = showTypes["综合"]
		}
	default:
		return CategoryResult{}, errors.New("无效的 kind")
	}

	if start < 0 {
		start = 0
	}
	if start > maxStart {
		start = maxStart
	}
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	return s.fetchHot(ctx, spec, start, limit)
}

func (s *Service) fetchHot(ctx context.Context, spec hotSpec, start, limit int) (CategoryResult, error) {
	u, _ := url.Parse(doubanBaseURL + "/rexxar/api/v2/subject/recent_hot/" + spec.kind)
	q := u.Query()
	q.Set("start", strconv.Itoa(start))
	q.Set("limit", strconv.Itoa(limit))
	if spec.category != "" {
		q.Set("category", spec.category)
	}
	if spec.typ != "" {
		q.Set("type", spec.typ)
	}
	u.RawQuery = q.Encode()
	key := u.String()

	s.mu.Lock()
	if entry, hit := s.cache[key]; hit && time.Now().Before(entry.expiresAt) {
		s.mu.Unlock()
		return entry.val, nil
	}
	if call, busy := s.inflight[key]; busy {
		s.mu.Unlock()
		select {
		case <-call.done:
			return call.val, call.err
		case <-ctx.Done():
			return CategoryResult{}, ctx.Err()
		}
	}
	call := &inflightCall{done: make(chan struct{})}
	s.inflight[key] = call
	s.mu.Unlock()

	val, err := s.requestDouban(ctx, key)

	s.mu.Lock()
	call.val = val
	call.err = err
	close(call.done)
	delete(s.inflight, key)
	if err == nil {
		if len(s.cache) >= maxCacheSize {
			now := time.Now()
			for k, v := range s.cache {
				if now.After(v.expiresAt) {
					delete(s.cache, k)
				}
			}
			if len(s.cache) >= maxCacheSize {
				for k := range s.cache {
					delete(s.cache, k)
					break
				}
			}
		}
		s.cache[key] = cacheEntry{val: val, expiresAt: time.Now().Add(cacheTTL)}
	}
	s.mu.Unlock()

	return val, err
}

func (s *Service) requestDouban(ctx context.Context, targetURL string) (CategoryResult, error) {
	reqCtx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, targetURL, nil)
	if err != nil {
		return CategoryResult{}, err
	}
	req.Header.Set("Referer", "https://movie.douban.com/")
	req.Header.Set("User-Agent", doubanUserAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")

	resp, err := s.client.Do(req)
	if err != nil {
		return CategoryResult{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return CategoryResult{}, fmt.Errorf("douban HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return CategoryResult{}, err
	}

	var raw struct {
		Total int `json:"total"`
		Items []struct {
			ID           string `json:"id"`
			Title        string `json:"title"`
			CardSubtitle string `json:"card_subtitle"`
			Pic          struct {
				Normal string `json:"normal"`
				Large  string `json:"large"`
			} `json:"pic"`
			Rating struct {
				Value float64 `json:"value"`
			} `json:"rating"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return CategoryResult{}, err
	}

	items := make([]RecommendationItem, 0, len(raw.Items))
	for _, it := range raw.Items {
		poster := it.Pic.Normal
		if poster == "" {
			poster = it.Pic.Large
		}
		rating := ""
		if it.Rating.Value > 0 {
			rating = fmt.Sprintf("%.1f", it.Rating.Value)
		}
		year := ""
		if m := yearRe.FindStringSubmatch(it.CardSubtitle); len(m) > 1 {
			year = m[1]
		}
		items = append(items, RecommendationItem{
			ID:          it.ID,
			Title:       it.Title,
			Poster:      poster,
			Rating:      rating,
			Year:        year,
			ExternalURL: "https://movie.douban.com/subject/" + it.ID,
		})
	}

	return CategoryResult{Items: items, Total: raw.Total}, nil
}
