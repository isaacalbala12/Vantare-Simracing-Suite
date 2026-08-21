package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/tts"
)

const cacheLockSchema = "vantare.engineer.voice-cache.v1"

type CacheLockEntry struct {
	Lang   string `json:"lang"`
	Voice  string `json:"voice"`
	Text   string `json:"text"`
	Key    string `json:"key"`
	Sha256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
	Format string `json:"format"`
	Kind   string `json:"kind"` // static | number | literal
	Intent string `json:"intent,omitempty"`
}

type CacheLock struct {
	Schema           string            `json:"schema"`
	Version          int               `json:"version"`
	Manifest         string            `json:"manifest"`
	ManifestSha256   string            `json:"manifestSha256"`
	ModelsLock       string            `json:"modelsLock"`
	ModelsLockSha256 string            `json:"modelsLockSha256"`
	GeneratedAt      string            `json:"generatedAt"`
	CacheRoot        string            `json:"cacheRoot"`
	Provider         string            `json:"provider"`
	Voices           map[string]string `json:"voices"`
	Clips            []CacheLockEntry  `json:"clips"`
	TotalClips       int               `json:"totalClips"`
	TotalBytes       int64             `json:"totalBytes"`
	PendingReal      bool              `json:"pendingRealSynthesis"`
	PendingNote      string            `json:"pendingNote,omitempty"`
}

var defaultVoices = map[string]string{
	"es":    "ef_dora",
	"en":    "af_bella",
	"it":    "if_sara",
	"pt-BR": "pf_dora",
}

func synthManifest(manifestPath, cacheRoot, providerName, modelsLockPath, cacheLockPath, kokoroURL string) error {
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("read manifest: %w", err)
	}
	var manifest CatalogVoiceManifest
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		return fmt.Errorf("parse manifest: %w", err)
	}
	// validate provider
	if providerName != "mock" && providerName != "kokoro" {
		return fmt.Errorf("unsupported provider %q (use mock|kokoro)", providerName)
	}
	// prepare cache
	if cacheRoot == "" {
		cacheRoot = tts.DefaultCacheRoot()
	}
	if cacheRoot == "" {
		return fmt.Errorf("cache root empty and DefaultCacheRoot unavailable")
	}
	cache, err := tts.NewCache(cacheRoot, "kokoro")
	if err != nil {
		return fmt.Errorf("new cache: %w", err)
	}

	// provider setup: use tts provider interface
	var provider tts.Provider
	tmpOut := os.TempDir()
	switch providerName {
	case "mock":
		mockDir := filepath.Join(os.TempDir(), "vantare-mock-tts")
		mp, err := tts.NewMockProvider(mockDir)
		if err != nil {
			return err
		}
		provider = mp
	case "kokoro":
		kp := tts.NewKokoroProvider(tmpOut)
		if kokoroURL != "" {
			kp.SetRESTURL(kokoroURL)
		}
		// health check: if not reachable, don't fake audio, mark pending
		if err := kp.Health(); err != nil {
			return fmt.Errorf("kokoro not reachable at %s: %w — marca gate PENDIENTE (ver README)", kpHealthURL(kp), err)
		}
		provider = kp
	}

	engine, err := tts.NewEngine(cache, provider)
	if err != nil {
		return err
	}

	// collect texts to synth
	type job struct {
		lang   string
		voice  string
		text   string
		kind   string
		intent string
	}
	jobs := []job{}
	for _, intent := range manifest.Intents {
		hasPH := len(intent.Placeholders) > 0
		for _, loc := range manifest.Locales {
			voice := defaultVoices[loc]
			lv := intent.Locales[loc]
			if !hasPH {
				jobs = append(jobs, job{lang: loc, voice: voice, text: lv.VoiceText, kind: "static", intent: intent.Intent})
			} else {
				// for intents with placeholders, synthesize literal segments (split by placeholders)
				literals := splitLiterals(lv.VoiceText)
				for _, lit := range literals {
					if lit == "" {
						continue
					}
					jobs = append(jobs, job{lang: loc, voice: voice, text: lit, kind: "literal", intent: intent.Intent})
				}
			}
		}
	}
	// add number clips per locale
	for _, loc := range manifest.Locales {
		voice := defaultVoices[loc]
		numTexts := manifest.NumberClips.Locales[loc]
		for _, n := range numTexts {
			jobs = append(jobs, job{lang: loc, voice: voice, text: n, kind: "number"})
		}
		// ensure coma word also (already included) but keep
	}

	// deduplicate jobs by lang+voice+text
	seen := map[string]job{}
	for _, j := range jobs {
		k := j.lang + "\x00" + j.voice + "\x00" + j.text
		if _, ok := seen[k]; !ok {
			seen[k] = j
		}
	}
	uniqJobs := make([]job, 0, len(seen))
	for _, v := range seen {
		uniqJobs = append(uniqJobs, v)
	}
	sort.Slice(uniqJobs, func(i, j int) bool {
		if uniqJobs[i].lang != uniqJobs[j].lang {
			return uniqJobs[i].lang < uniqJobs[j].lang
		}
		if uniqJobs[i].voice != uniqJobs[j].voice {
			return uniqJobs[i].voice < uniqJobs[j].voice
		}
		return uniqJobs[i].text < uniqJobs[j].text
	})

	clips := []CacheLockEntry{}
	var totalBytes int64
	for _, j := range uniqJobs {
		path, err := engine.SynthOrCache(tts.Request{Language: j.lang, Voice: j.voice, Text: j.text})
		if err != nil {
			return fmt.Errorf("synth %s/%s %q: %w", j.lang, j.voice, j.text, err)
		}
		// hash file
		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read cached file: %w", err)
		}
		h := sha256.Sum256(data)
		sha := hex.EncodeToString(h[:])
		format := "mp3"
		if filepath.Ext(path) == ".wav" {
			format = "wav"
		}
		// For spotter intents, gate expects WAV PCM; mock produces mp3, so note format is mp3 until real
		key := cache.Key(j.lang, j.voice, j.text)
		clips = append(clips, CacheLockEntry{
			Lang: j.lang, Voice: j.voice, Text: j.text, Key: key, Sha256: sha, Bytes: int64(len(data)), Format: format, Kind: j.kind, Intent: j.intent,
		})
		totalBytes += int64(len(data))
		// Also write legacy fallback file lang/voice/intent.mp3 for spotter? Only if text equals intent? No.
		// For compatibility, also ensure a fallback file exists at cacheRoot/../lang/voice/text.mp3? That is handled by router fallback.
		// We optionally create legacy file for spotter static texts as lang/voice/text.mp3 copy to aid manual verification.
		legacyDir := filepath.Join(filepath.Dir(cache.Root()), j.lang, j.voice)
		// sanitize filename? Use text as filename might contain spaces/special; use intent name if kind static? But for generic, skip.
		// Only for spotter kind static we could create legacy file named <intent>.mp3, but we already have hashed cache, legacy not required for hashed path.
		_ = legacyDir
	}

	// models lock hash
	modelsLockHash := ""
	if modelsLockPath != "" {
		if data, err := os.ReadFile(modelsLockPath); err == nil {
			h := sha256.Sum256(data)
			modelsLockHash = hex.EncodeToString(h[:])
		}
	}
	manifestHash := ""
	{
		h := sha256.Sum256(manifestData)
		manifestHash = hex.EncodeToString(h[:])
	}

	lock := CacheLock{
		Schema:           cacheLockSchema,
		Version:          1,
		Manifest:         filepath.ToSlash(manifestPath),
		ManifestSha256:   manifestHash,
		ModelsLock:       filepath.ToSlash(modelsLockPath),
		ModelsLockSha256: modelsLockHash,
		GeneratedAt:      time.Now().UTC().Format(time.RFC3339),
		CacheRoot:        cacheRoot,
		Provider:         providerName,
		Voices:           defaultVoices,
		Clips:            clips,
		TotalClips:       len(clips),
		TotalBytes:       totalBytes,
		PendingReal:      providerName == "mock",
	}
	if providerName == "mock" {
		lock.PendingNote = "Audio generado con MockProvider (no es Kokoro real). Para audio real, instalar Kokoro (ver voice-models.lock.json) y ejecutar con --provider kokoro --kokoro-url http://localhost:8880/v1/audio/speech. Gate de síntesis real PENDIENTE hasta Kokoro instalable sin red."
	}

	out, err := json.MarshalIndent(lock, "", "  ")
	if err != nil {
		return err
	}
	out = append(out, '\n')
	if cacheLockPath == "" {
		cacheLockPath = "tools/engineer-voice-cache/voice-cache.lock.json"
	}
	if err := os.MkdirAll(filepath.Dir(cacheLockPath), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(cacheLockPath, out, 0o644); err != nil {
		return err
	}
	fmt.Printf("Synth complete: %d clips, %d bytes, provider=%s, cacheRoot=%s\nLock: %s\n", len(clips), totalBytes, providerName, cacheRoot, cacheLockPath)
	if lock.PendingReal {
		fmt.Printf("NOTA: %s\n", lock.PendingNote)
	}
	return nil
}

func splitLiterals(voiceText string) []string {
	// split by placeholder regex, keep literals
	locs := placeholderRe.FindAllStringIndex(voiceText, -1)
	if len(locs) == 0 {
		return []string{voiceText}
	}
	out := []string{}
	prev := 0
	for _, loc := range locs {
		if loc[0] > prev {
			lit := strings.TrimSpace(voiceText[prev:loc[0]])
			if lit != "" {
				out = append(out, lit)
			}
		}
		prev = loc[1]
	}
	if prev < len(voiceText) {
		lit := strings.TrimSpace(voiceText[prev:])
		if lit != "" {
			out = append(out, lit)
		}
	}
	return out
}

func kpHealthURL(kp *tts.KokoroProvider) string {
	// not exported; use default
	return "http://localhost:8880/v1/audio/speech"
}
