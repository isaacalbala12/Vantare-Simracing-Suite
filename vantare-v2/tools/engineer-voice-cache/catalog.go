package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const manifestSchema = "vantare.engineer.catalog-voice.v1"

var placeholderRe = regexp.MustCompile(`\{[a-zA-Z_]+\}`)
var intentRe = regexp.MustCompile("`([^`]+)`")
var familyHeaderRe = regexp.MustCompile(`(?i)Familia\s+([^—\-]+)`)

type LocaleVoice struct {
	VoiceText    string   `json:"voiceText"`
	Placeholders []string `json:"placeholders"`
}

type IntentEntry struct {
	Intent       string                 `json:"intent"`
	Family       string                 `json:"family"`
	Priority     string                 `json:"priority"`
	Type         string                 `json:"type"`
	TTL          string                 `json:"ttl"`
	VoiceTexts   map[string]string      `json:"voiceTexts"`
	Placeholders []string               `json:"placeholders"`
	Locales      map[string]LocaleVoice `json:"locales"`
}

type NumberClipsSpec struct {
	Locales map[string][]string `json:"locales"`
	Special map[string]string   `json:"special"`
}

type ConcatenationScheme struct {
	Description string `json:"description"`
	Detail      string `json:"detail"`
	Example     string `json:"example"`
}

type CatalogVoiceManifest struct {
	Schema          string              `json:"schema"`
	Version         int                 `json:"version"`
	Source          string              `json:"source"`
	SourceSha256    string              `json:"sourceSha256"`
	GeneratedAt     string              `json:"generatedAt"`
	Locales         []string            `json:"locales"`
	VoiceModelsLock string              `json:"voiceModelsLock"`
	Intents         []IntentEntry       `json:"intents"`
	NumberClips     NumberClipsSpec     `json:"numberClips"`
	Concatenation   ConcatenationScheme `json:"concatenation"`
}

func parseCatalog(path string) (*CatalogVoiceManifest, []byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, fmt.Errorf("read catalog: %w", err)
	}
	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	content := string(data)
	lines := strings.Split(content, "\n")

	locales := []string{"es", "en", "it", "pt-BR"}
	intents := make([]IntentEntry, 0, 70)
	currentFamily := ""

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "## ") {
			m := familyHeaderRe.FindStringSubmatch(trimmed)
			if len(m) >= 2 {
				f := strings.TrimSpace(m[1])
				// normalize: take first word lowercased
				parts := strings.Fields(f)
				if len(parts) > 0 {
					currentFamily = strings.ToLower(parts[0])
					// handle strategy/motivación -> strategy
					if strings.Contains(currentFamily, "strategy") {
						currentFamily = "strategy"
					}
					// conditions -> conditions
					// racetime -> racetime
					// sessionend -> sessionend
				}
			}
			continue
		}
		if !strings.HasPrefix(trimmed, "|") {
			continue
		}
		// detect header/separator
		lower := strings.ToLower(trimmed)
		if strings.Contains(lower, "| intent |") || strings.Contains(lower, "| intent     ") {
			continue
		}
		if strings.Contains(trimmed, "---") {
			continue
		}
		// data row candidate: must contain backtick intent
		if !strings.Contains(trimmed, "`") {
			continue
		}
		cols := splitPipeRow(trimmed)
		if len(cols) != 9 {
			// tabla de leyenda u otra no-catálogo (2 columnas): ignorar
			continue
		}
		intentCell := cols[0]
		m := intentRe.FindStringSubmatch(intentCell)
		if len(m) < 2 {
			return nil, nil, fmt.Errorf("strict parse error line %d: intent without backticks: %q", i+1, trimmed)
		}
		intent := strings.TrimSpace(m[1])
		if intent == "" {
			return nil, nil, fmt.Errorf("strict parse error line %d: empty intent", i+1)
		}
		// voice columns 1..4
		voiceTexts := make(map[string]string, 4)
		localesVoices := make(map[string]LocaleVoice, 4)
		placeholdersSet := make(map[string]struct{})
		allPlaceholders := make(map[string][]string)
		for idx, locale := range locales {
			cell := cols[1+idx]
			voice := extractVoice(cell)
			if voice == "" {
				return nil, nil, fmt.Errorf("strict parse error line %d locale %s: empty voice text: %q", i+1, locale, cell)
			}
			if len(voice) > 256 {
				return nil, nil, fmt.Errorf("strict parse error line %d locale %s: voice text too long", i+1, locale)
			}
			if strings.ContainsRune(voice, 0) {
				return nil, nil, fmt.Errorf("strict parse error line %d locale %s: NUL in voice", i+1, locale)
			}
			phs := placeholderRe.FindAllString(voice, -1)
			// deduplicate per locale preserving order
			seen := map[string]struct{}{}
			uniq := []string{}
			for _, ph := range phs {
				if _, ok := seen[ph]; !ok {
					seen[ph] = struct{}{}
					uniq = append(uniq, ph)
				}
			}
			voiceTexts[locale] = voice
			localesVoices[locale] = LocaleVoice{VoiceText: voice, Placeholders: uniq}
			allPlaceholders[locale] = uniq
			for _, ph := range uniq {
				placeholdersSet[ph] = struct{}{}
			}
		}
		// validate placeholders consistent across locales (same set ignoring order)
		if len(allPlaceholders) > 0 {
			ref := allPlaceholders[locales[0]]
			refSet := toSet(ref)
			for _, loc := range locales[1:] {
				if !setsEqual(refSet, toSet(allPlaceholders[loc])) {
					return nil, nil, fmt.Errorf("strict parse error line %d intent %s: placeholders mismatch across locales: %v vs %v", i+1, intent, ref, allPlaceholders[loc])
				}
			}
		}
		aggPH := setToSortedSlice(placeholdersSet)
		// tipo, prioridad, ttl
		tipo := cols[5]
		prioridad := extractPriority(cols[6])
		ttl := cols[7]
		family := currentFamily
		// derive family from intent prefix if header missing
		if family == "" {
			if idx := strings.Index(intent, "."); idx > 0 {
				family = intent[:idx]
			}
		}
		intents = append(intents, IntentEntry{
			Intent:       intent,
			Family:       family,
			Priority:     prioridad,
			Type:         tipo,
			TTL:          ttl,
			VoiceTexts:   voiceTexts,
			Placeholders: aggPH,
			Locales:      localesVoices,
		})
	}

	if len(intents) != 70 {
		return nil, nil, fmt.Errorf("strict parse error: expected 70 intents, got %d", len(intents))
	}
	// check duplicates
	seenIntents := map[string]struct{}{}
	for _, e := range intents {
		if _, ok := seenIntents[e.Intent]; ok {
			return nil, nil, fmt.Errorf("duplicate intent %q", e.Intent)
		}
		seenIntents[e.Intent] = struct{}{}
	}

	numberClips := buildNumberClips(locales)
	concat := ConcatenationScheme{
		Description: "Concatenación por segmentos literales + clips numéricos (estilo CrewChief).",
		Detail:      "Cada VoiceText con placeholders se tokeniza por placeholders ({n},{gap},{pos},{lap}...). Los segmentos literales entre placeholders (ej. \"Combustible, \" y \" litros, \") se sintetizan como clips independientes (cache key por texto literal). Los números se resuelven via NumberClips: 0-99 directos, 100-900 por centenas + resto, y decimales como <entero> + <coma> + dígitos individuales. La reproducción concatena los audios resultantes sin crossfade, con gap de ~40ms. Spotter (P0) debe ser WAV PCM para evitar decode; resto puede ser mp3. Ver README § Concatenación.",
		Example:     "fuel.status_on_demand es: \"Combustible, {n} litros, {gap} vueltas estimadas\" -> [\"Combustible, \", numberClip(n), \" litros, \", numberClip(gap), \" vueltas estimadas\"] ; gap=1.5 es en es -> [\"1\",\"coma\",\"5\"]",
	}

	modTime := ""
	if fi, err := os.Stat(path); err == nil {
		modTime = fi.ModTime().UTC().Format(time.RFC3339)
	} else {
		modTime = time.Now().UTC().Format(time.RFC3339)
	}
	manifest := &CatalogVoiceManifest{
		Schema:          manifestSchema,
		Version:         1,
		Source:          filepath.ToSlash(path),
		SourceSha256:    sha,
		GeneratedAt:     modTime,
		Locales:         locales,
		VoiceModelsLock: "tools/engineer-voice-cache/voice-models.lock.json",
		Intents:         intents,
		NumberClips:     numberClips,
		Concatenation:   concat,
	}
	// marshal for stable output: indent 2, sort keys via encoding/json (deterministic for struct)
	out, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, nil, err
	}
	// ensure trailing newline
	out = append(out, '\n')
	return manifest, out, nil
}

func splitPipeRow(line string) []string {
	t := strings.TrimSpace(line)
	t = strings.TrimPrefix(t, "|")
	t = strings.TrimSuffix(t, "|")
	parts := strings.Split(t, "|")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		out = append(out, strings.TrimSpace(p))
	}
	return out
}

func extractVoice(cell string) string {
	if strings.Contains(cell, "·") {
		parts := strings.Split(cell, "·")
		if len(parts) >= 2 {
			// voice is after last ·
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	return strings.TrimSpace(cell)
}

func extractPriority(cell string) string {
	// cell like "P0 `Spotter`" or "P2 `FailureResource`"
	cell = strings.TrimSpace(cell)
	if strings.HasPrefix(cell, "P0") {
		return "P0"
	}
	if strings.HasPrefix(cell, "P1") {
		return "P1"
	}
	if strings.HasPrefix(cell, "P2") {
		return "P2"
	}
	if strings.HasPrefix(cell, "P3") {
		return "P3"
	}
	return cell
}

func toSet(s []string) map[string]struct{} {
	m := make(map[string]struct{}, len(s))
	for _, v := range s {
		m[v] = struct{}{}
	}
	return m
}
func setsEqual(a, b map[string]struct{}) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if _, ok := b[k]; !ok {
			return false
		}
	}
	return true
}
func setToSortedSlice(m map[string]struct{}) []string {
	if len(m) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	// sort for determinism
	// placeholders are like {gap},{n},{pos} -> alphabetical
	for i := 0; i < len(out)-1; i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j] < out[i] {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func buildNumberClips(locales []string) NumberClipsSpec {
	m := make(map[string][]string, len(locales))
	special := map[string]string{
		"es":    "coma",
		"en":    "point",
		"it":    "virgola",
		"pt-BR": "vírgula",
	}
	for _, loc := range locales {
		list := []string{}
		// 0-99
		for i := 0; i < 100; i++ {
			list = append(list, fmt.Sprintf("%d", i))
		}
		// hundreds 100,200...900
		for i := 100; i <= 900; i += 100 {
			list = append(list, fmt.Sprintf("%d", i))
		}
		// thousand placeholder? no
		// add special coma word as spoken token (not numeric)
		commaWord := special[loc]
		list = append(list, commaWord)
		m[loc] = list
	}
	return NumberClipsSpec{Locales: m, Special: special}
}
