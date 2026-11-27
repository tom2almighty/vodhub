package cms

import (
	"testing"

	"vodhub/internal/store"
)

func TestParsePlayURLPrefersM3U8(t *testing.T) {
	raw := "第1集$https://a.example/1.html#第2集$https://a.example/2.html$$$第1集$https://b.example/1.m3u8#第2集$https://b.example/2.m3u8"
	urls, names := ParsePlayURL(raw, "web$$$bfm3u8")
	if len(urls) != 2 || urls[0] != "https://b.example/1.m3u8" || names[1] != "第2集" {
		t.Fatalf("unexpected parse result: urls=%v names=%v", urls, names)
	}
}

func TestRelevanceScoringAndFiltering(t *testing.T) {
	items := []SearchResult{
		{ID: "1", Title: "无关电影"},
		{ID: "2", Title: "庆余年 第二季"},
		{ID: "3", Title: "庆余年"},
		{ID: "4", Title: "张若昀合集", Actors: "张若昀,李沁"},
	}
	filtered := SortByRelevance(FilterRelevant(items, "庆余年"), "庆余年")
	if len(filtered) != 2 {
		t.Fatalf("expected 2 relevant items, got %d: %+v", len(filtered), filtered)
	}
	if filtered[0].ID != "3" || filtered[1].ID != "2" {
		t.Fatalf("expected exact match first, got order %s, %s", filtered[0].ID, filtered[1].ID)
	}
}

func TestSortByRelevanceAndPriority(t *testing.T) {
	sources := []store.VideoSource{
		{ID: "first", Weight: 0},
		{ID: "second", Weight: 0},
		{ID: "boosted", Weight: 10},
		{ID: "demoted", Weight: -5},
	}
	items := []SearchResult{
		{ID: "d", Title: "庆余年", Source: "demoted"},
		{ID: "s", Title: "庆余年", Source: "second"},
		{ID: "f", Title: "庆余年", Source: "first"},
		{ID: "b", Title: "庆余年", Source: "boosted"},
		{ID: "p", Title: "庆余年 第二季", Source: "boosted"},
	}
	sorted := SortByRelevanceAndPriority(items, "庆余年", sources)
	want := []string{"b", "f", "s", "d", "p"}
	for i, id := range want {
		if sorted[i].ID != id {
			t.Fatalf("pos %d: want %s, got %s (full: %+v)", i, id, sorted[i].ID, sorted)
		}
	}
}

func TestBuildSearchURL(t *testing.T) {
	u1 := BuildSearchURL("https://example.com/api.php/provide/vod", "庆余年", 1)
	if u1 != "https://example.com/api.php/provide/vod?ac=videolist&wd=%E5%BA%86%E4%BD%99%E5%B9%B4" {
		t.Fatalf("unexpected url: %s", u1)
	}
	u2 := BuildSearchURL("https://jyzyapi.com/provide/vod/from/jinyingyun/at/json", "test", 2)
	if u2 != "https://jyzyapi.com/provide/vod/from/jinyingyun/at/json?ac=videolist&wd=test&pg=2" {
		t.Fatalf("unexpected custom path url: %s", u2)
	}
}
