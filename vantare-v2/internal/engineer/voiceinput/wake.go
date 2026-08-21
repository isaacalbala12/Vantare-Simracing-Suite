package voiceinput

import (
	"strings"

	"github.com/vantare/overlays/v2/internal/engineer/commands"
)

// KeywordDetector is a deliberately simple placeholder for synthetic probes.
// It recognizes only the exact catalog wake words after normalization. It is
// not an acoustic detector and must not be presented as FAR/FRR evidence.
type KeywordDetector struct {
	words map[string]struct{}
}

func NewKeywordDetector(catalog commands.Catalog) KeywordDetector {
	words := make(map[string]struct{}, len(catalog.WakeWords))
	for _, word := range catalog.WakeWords {
		words[normalizeKeyword(word)] = struct{}{}
	}
	return KeywordDetector{words: words}
}

func (detector KeywordDetector) Match(value string) bool {
	_, ok := detector.words[normalizeKeyword(value)]
	return ok
}

func normalizeKeyword(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(value)), " "))
}
