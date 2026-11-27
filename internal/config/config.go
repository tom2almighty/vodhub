package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	defaultPort              = 3000
	defaultSiteName          = "vodhub"
	defaultAuthTokenTTLSec   = 7 * 24 * 60 * 60
	defaultSearchConcurrency = 5
	maxSearchConcurrency     = 20
	defaultSearchTimeoutSec  = 15
)

// Config holds all runtime settings loaded from environment variables (and optional .env).
type Config struct {
	Port                   int
	SiteName               string
	Announcement           string
	AnnouncementTitle      string
	AdminPassword          string
	AccessPassword         string
	AuthSecret             string
	AuthTokenTTL           time.Duration
	DataDir                string
	SourcesURL             string
	SourcesJSON            string
	SearchConcurrency      int
	SearchTimeout          time.Duration
	UpstreamProxy          string
	ImageProxyAllowedHosts []string
}

// Load reads an optional local .env file (without overriding existing env vars)
// and builds the validated Config.
func Load() Config {
	loadDotEnv(".env")

	concurrency := envInt("SEARCH_CONCURRENCY", defaultSearchConcurrency)
	if concurrency < 1 {
		concurrency = 1
	}
	if concurrency > maxSearchConcurrency {
		concurrency = maxSearchConcurrency
	}

	hosts := []string{"doubanio.com", "douban.com"}
	if extra := envStr("IMAGE_PROXY_ALLOWED_HOSTS"); extra != "" {
		for _, item := range strings.Split(extra, ",") {
			if h := strings.ToLower(strings.TrimSpace(item)); h != "" {
				hosts = append(hosts, h)
			}
		}
	}

	dataDir := envStr("DATA_DIR")
	if dataDir == "" {
		dataDir = filepath.Join(".", "data")
	}

	siteName := envStr("SITE_NAME")
	if siteName == "" {
		siteName = defaultSiteName
	}

	return Config{
		Port:                   envInt("PORT", defaultPort),
		SiteName:               siteName,
		Announcement:           envStr("SITE_ANNOUNCEMENT"),
		AnnouncementTitle:      envStr("SITE_ANNOUNCEMENT_TITLE"),
		AdminPassword:          envStr("ADMIN_PASSWORD"),
		AccessPassword:         envStr("ACCESS_PASSWORD"),
		AuthSecret:             envStr("AUTH_SECRET"),
		AuthTokenTTL:           time.Duration(envInt("AUTH_TOKEN_TTL", defaultAuthTokenTTLSec)) * time.Second,
		DataDir:                dataDir,
		SourcesURL:             envStr("SOURCES_URL"),
		SourcesJSON:            envStr("SOURCES_JSON"),
		SearchConcurrency:      concurrency,
		SearchTimeout:          time.Duration(envInt("SEARCH_TIMEOUT_SECONDS", defaultSearchTimeoutSec)) * time.Second,
		UpstreamProxy:          envStr("UPSTREAM_PROXY"),
		ImageProxyAllowedHosts: hosts,
	}
}

func envStr(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}

func envInt(key string, fallback int) int {
	raw := envStr(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key := strings.TrimSpace(k)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		val := strings.TrimSpace(v)
		if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
			val = val[1 : len(val)-1]
		}
		_ = os.Setenv(key, val)
	}
}
