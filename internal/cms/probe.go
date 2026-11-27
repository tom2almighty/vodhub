package cms

import (
	"context"
	"fmt"
	"strings"
	"time"

	"vodhub/internal/store"
)

const (
	realProbeQuery       = "庆余年"
	impossibleProbeQuery = "不存在的片名xyz987654"
)

// Probe verifies reachability and real search support using the exact same
// MacCMS client and per-source proxy routing used during live search.
func (c *Client) Probe(ctx context.Context, src store.VideoSource) store.ProbeInfo {
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	if !store.IsHTTPURL(src.URL) {
		return store.ProbeInfo{
			Status:    store.ProbeError,
			Message:   "无效的源地址",
			CheckedAt: checkedAt,
		}
	}

	probeSrc := src
	if probeSrc.Timeout <= 0 || probeSrc.Timeout > 12000 {
		probeSrc.Timeout = 8000
	}

	start := time.Now()
	realItems, err := c.SearchSourceRaw(ctx, realProbeQuery, probeSrc, 0)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return store.ProbeInfo{
			Status:    store.ProbeError,
			LatencyMs: &latency,
			Message:   simplifyProbeError(err),
			CheckedAt: checkedAt,
		}
	}

	realMatched := FilterRelevant(realItems, realProbeQuery)
	randItems, _ := c.SearchSourceRaw(ctx, impossibleProbeQuery, probeSrc, 0)

	if len(randItems) >= 5 {
		return store.ProbeInfo{
			Status:    store.ProbeFakeSearch,
			LatencyMs: &latency,
			Message:   fmt.Sprintf("不支持搜索（无关词返回 %d 条）", len(randItems)),
			CheckedAt: checkedAt,
		}
	}

	if len(realItems) >= 5 && len(realMatched) == 0 {
		return store.ProbeInfo{
			Status:    store.ProbeFakeSearch,
			LatencyMs: &latency,
			Message:   fmt.Sprintf("搜索结果与关键词无关（返回 %d 条未命中）", len(realItems)),
			CheckedAt: checkedAt,
		}
	}

	if len(realItems) == 0 {
		return store.ProbeInfo{
			Status:    store.ProbeEmpty,
			LatencyMs: &latency,
			Message:   "接口可访问但未搜到测试片名",
			CheckedAt: checkedAt,
		}
	}

	return store.ProbeInfo{
		Status:    store.ProbeOK,
		LatencyMs: &latency,
		Message:   fmt.Sprintf("搜索正常（命中 %d/%d 条）", len(realMatched), len(realItems)),
		CheckedAt: checkedAt,
	}
}

func simplifyProbeError(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "deadline exceeded"), strings.Contains(msg, "timeout"):
		return "请求超时"
	case strings.Contains(msg, "no such host"), strings.Contains(msg, "connectex"), strings.Contains(msg, "connection refused"):
		return "网络连接失败（无法直连）"
	case len([]rune(msg)) > 60:
		return string([]rune(msg)[:60])
	default:
		return msg
	}
}
