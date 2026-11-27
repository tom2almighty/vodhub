package cms

import (
	"sort"
	"strings"
	"unicode"

	"vodhub/internal/store"
)

// normalizeText folds full-width ASCII characters to half-width and lowercases.
func normalizeText(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range strings.TrimSpace(s) {
		switch {
		case r >= 0xFF01 && r <= 0xFF5E:
			r -= 0xFEE0
		case r == 0x3000:
			r = ' '
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

func compactText(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range normalizeText(s) {
		if unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// ScoreRelevance scores how closely a SearchResult matches query.
// A score of 0 filters out MacCMS sources that ignore `wd=` and dump their default list.
func ScoreRelevance(item SearchResult, query string) int {
	normQuery := normalizeText(query)
	compQuery := compactText(normQuery)
	if compQuery == "" {
		return 0
	}

	compTitle := compactText(item.Title)
	if compTitle == compQuery {
		return 100
	}
	if strings.HasPrefix(compTitle, compQuery) {
		return 80
	}
	if strings.Contains(compTitle, compQuery) {
		return 60
	}

	rawTokens := strings.Fields(normQuery)
	tokens := make([]string, 0, len(rawTokens))
	for _, t := range rawTokens {
		if ct := compactText(t); ct != "" {
			tokens = append(tokens, ct)
		}
	}

	if len(tokens) > 1 && allContained(compTitle, tokens) {
		return 50
	}

	compPeople := compactText(item.Actors + " " + item.Directors)
	if len([]rune(compQuery)) >= 2 && strings.Contains(compPeople, compQuery) {
		return 30
	}

	if len(tokens) > 1 {
		allHit := true
		for _, t := range tokens {
			if !strings.Contains(compTitle, t) && !strings.Contains(compPeople, t) {
				allHit = false
				break
			}
		}
		if allHit {
			return 25
		}
	}

	return 0
}

func allContained(haystack string, tokens []string) bool {
	for _, t := range tokens {
		if !strings.Contains(haystack, t) {
			return false
		}
	}
	return true
}

func FilterRelevant(items []SearchResult, query string) []SearchResult {
	if len(items) == 0 {
		return nil
	}
	out := make([]SearchResult, 0, len(items))
	for _, item := range items {
		if ScoreRelevance(item, query) > 0 {
			out = append(out, item)
		}
	}
	return out
}

func SortByRelevance(items []SearchResult, query string) []SearchResult {
	return SortByRelevanceAndPriority(items, query, nil)
}

// SortByRelevanceAndPriority orders search results by keyword relevance first,
// then explicit source weight (descending), then source list order (ascending).
func SortByRelevanceAndPriority(items []SearchResult, query string, sources []store.VideoSource) []SearchResult {
	if len(items) <= 1 {
		return items
	}
	type sourceRank struct {
		weight int
		order  int
	}
	ranks := make(map[string]sourceRank, len(sources))
	for i, src := range sources {
		ranks[src.ID] = sourceRank{weight: src.Weight, order: i}
	}
	fallbackOrder := len(sources) + 1

	type scored struct {
		item   SearchResult
		score  int
		weight int
		order  int
		idx    int
	}
	list := make([]scored, len(items))
	for i, it := range items {
		r, ok := ranks[it.Source]
		if !ok {
			r = sourceRank{weight: 0, order: fallbackOrder}
		}
		list[i] = scored{
			item:   it,
			score:  ScoreRelevance(it, query),
			weight: r.weight,
			order:  r.order,
			idx:    i,
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].score != list[j].score {
			return list[i].score > list[j].score
		}
		if list[i].weight != list[j].weight {
			return list[i].weight > list[j].weight
		}
		if list[i].order != list[j].order {
			return list[i].order < list[j].order
		}
		return list[i].idx < list[j].idx
	})
	out := make([]SearchResult, len(items))
	for i, s := range list {
		out[i] = s.item
	}
	return out
}
