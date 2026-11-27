package proxy

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"time"
)

const (
	imageTimeout   = 10 * time.Second
	maxImageBytes  = 8 * 1024 * 1024
	imageCacheCtrl = "public, max-age=15552000, s-maxage=15552000, immutable"
	imageUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

var (
	errBlockedHost = errors.New("forbidden host")
	errTooLarge    = errors.New("image too large")
)

// ImageProxy serves allowed remote poster images with SSRF protection (host
// allowlist, DNS-resolved IP filtering, post-redirect re-validation, and 8 MB cap).
type ImageProxy struct {
	allowedHosts []string
	client       *http.Client
}

func NewImageProxy(allowedHosts []string) *ImageProxy {
	p := &ImageProxy{allowedHosts: allowedHosts}
	dialer := &net.Dialer{Timeout: 6 * time.Second, KeepAlive: 30 * time.Second}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
			if err != nil {
				return nil, err
			}
			if slices.ContainsFunc(ips, isBlockedIP) {
				return nil, errBlockedHost
			}
			if len(ips) == 0 {
				return nil, errBlockedHost
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
		},
		MaxIdleConns:        50,
		IdleConnTimeout:     60 * time.Second,
		TLSHandshakeTimeout: 6 * time.Second,
	}

	p.client = &http.Client{
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			if !p.isAllowedURL(req.URL) {
				return errBlockedHost
			}
			return nil
		},
	}
	return p
}

func (p *ImageProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	if raw == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	targetURL, err := url.Parse(raw)
	if err != nil || (targetURL.Scheme != "http" && targetURL.Scheme != "https") || targetURL.Host == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if !p.isAllowedURL(targetURL) {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), imageTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL.String(), nil)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	referer := targetURL.Scheme + "://" + targetURL.Host
	if hostMatches(targetURL.Hostname(), []string{"doubanio.com", "douban.com"}) {
		referer = "https://movie.douban.com/"
	}
	req.Header.Set("Referer", referer)
	req.Header.Set("User-Agent", imageUserAgent)

	resp, err := p.client.Do(req)
	if err != nil {
		if errors.Is(err, errBlockedHost) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.Request != nil && resp.Request.URL != nil && !p.isAllowedURL(resp.Request.URL) {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	if resp.StatusCode == http.StatusNotFound {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		w.WriteHeader(http.StatusBadGateway)
		return
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if !strings.HasPrefix(contentType, "image/") {
		w.WriteHeader(http.StatusUnsupportedMediaType)
		return
	}
	if resp.ContentLength > maxImageBytes {
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		return
	}

	body, err := readCapped(resp.Body, maxImageBytes)
	if err != nil {
		if errors.Is(err, errTooLarge) {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusBadGateway)
		return
	}

	for _, name := range []string{"Content-Type", "ETag", "Last-Modified"} {
		if v := resp.Header.Get(name); v != "" {
			w.Header().Set(name, v)
		}
	}
	w.Header().Set("Cache-Control", imageCacheCtrl)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (p *ImageProxy) isAllowedURL(u *url.URL) bool {
	if u == nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	host := u.Hostname()
	if !hostMatches(host, p.allowedHosts) {
		return false
	}
	if ip, err := netip.ParseAddr(host); err == nil && isBlockedIP(ip) {
		return false
	}
	return true
}

func hostMatches(hostname string, allowed []string) bool {
	host := strings.ToLower(strings.TrimSpace(hostname))
	for _, base := range allowed {
		base = strings.ToLower(strings.TrimSpace(base))
		if base != "" && (host == base || strings.HasSuffix(host, "."+base)) {
			return true
		}
	}
	return false
}

func isBlockedIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	// Block CGNAT (100.64.0.0/10)
	if ip.Is4() {
		b := ip.As4()
		if b[0] == 100 && b[1] >= 64 && b[1] <= 127 {
			return true
		}
		if b[0] >= 224 {
			return true
		}
	}
	return false
}

func readCapped(r io.Reader, maxBytes int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, errTooLarge
	}
	return data, nil
}
