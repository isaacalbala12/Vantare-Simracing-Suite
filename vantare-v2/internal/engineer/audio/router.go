// Package audio provides configuration for multi-language TTS audio.
// Each "channel" (spotter, engineer) can have independent language and voice settings.
package audio

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync/atomic"

	"github.com/vantare/overlays/v2/internal/tts"
)

// AudioRouter resolves a text key + channel to an audio file path.
// Cache-first; on miss calls tts.Engine.SynthOrCache for on-demand synthesis.
//
// The config field uses atomic.Value so that SetConfig (called from settings
// handler) and Resolve (called from queueLoop) can be safe across goroutines
// without a separate mutex.
type AudioRouter struct {
	config   atomic.Value // stores *AudioConfig
	engine   *tts.Engine
	cache    *tts.Cache
	cacheDir string
}

// NewAudioRouter builds an AudioRouter. All parameters are optional — nil-safe
// handling is built into Resolve and SetConfig.
func NewAudioRouter(config *AudioConfig, engine *tts.Engine, cacheDir string) *AudioRouter {
	r := &AudioRouter{
		engine:   engine,
		cacheDir: cacheDir,
	}
	if engine != nil {
		r.cache = engine.Cache()
	}
	if config != nil {
		r.config.Store(config)
	}
	return r
}

// NewCacheOnlyAudioRouter builds a router that can read audio previously
// prepared by a TTS engine without retaining the engine or invoking a
// provider. This is the production ENG-06 path.
func NewCacheOnlyAudioRouter(config *AudioConfig, cache *tts.Cache) *AudioRouter {
	r := &AudioRouter{cache: cache}
	if cache != nil {
		// Preserve compatibility with the older unpacked phrase layout while
		// making the canonical hashed TTS cache authoritative.
		r.cacheDir = filepath.Dir(cache.Root())
	}
	if config != nil {
		r.config.Store(config)
	}
	return r
}

// Resolve returns the path to an audio file or "" if unavailable.
// Nil-safe on all fields — returns "" for nil router, nil engine, or nil config.
func (r *AudioRouter) Resolve(textKey string, ch Channel) string {
	if r == nil {
		return ""
	}
	cfg := r.config.Load()
	if cfg == nil {
		return ""
	}
	ac := cfg.(*AudioConfig)

	lang := ac.Lang(ch)
	voice := ac.Voice(ch)
	expectedPath := filepath.Join(r.cacheDir, lang, voice, textKey+".mp3")

	// Cache hit: return path regardless of engine availability.
	if _, err := os.Stat(expectedPath); err == nil {
		return expectedPath
	}

	// Cache miss: need a functioning engine to synthesize.
	if r.engine == nil {
		return ""
	}
	path, err := r.engine.SynthOrCache(tts.Request{
		Language: lang,
		Voice:    voice,
		Text:     textKey,
	})
	if err != nil {
		return ""
	}
	return path
}

// ResolveCached returns an already prepared audio path without invoking the
// TTS engine. Product delivery uses this method so cache misses can never put
// synthesis, downloads or an external process on the latency-critical path.
//
// The caches are local and the only I/O is bounded metadata lookup. The
// context is checked between lookups so lifecycle cancellation is observed
// before playback can start.
func (r *AudioRouter) ResolveCached(ctx context.Context, textKey string, ch Channel) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if r == nil {
		return "", nil
	}
	cfg := r.config.Load()
	if cfg == nil {
		return "", nil
	}
	ac := cfg.(*AudioConfig)
	if textKey == "" {
		return "", nil
	}
	lang, voice := ac.Lang(ch), ac.Voice(ch)
	if r.cache != nil {
		key := r.cache.Key(lang, voice, textKey)
		if path := r.cache.Get(key); path != "" {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return "", ctxErr
			}
			return path, nil
		}
	}
	if r.cacheDir == "" {
		return "", nil
	}
	expectedPath := filepath.Join(r.cacheDir, lang, voice, textKey+".mp3")
	info, err := os.Stat(expectedPath)
	if ctxErr := ctx.Err(); ctxErr != nil {
		return "", ctxErr
	}
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil || info.IsDir() {
		return "", err
	}
	return expectedPath, nil
}

// ResolvePresentationCached resolves the canonical voice text from ENG-07's
// hashed cache while preserving read-only compatibility with the historical
// unpacked intent-key layout. It never synthesizes or downloads audio.
func (r *AudioRouter) ResolvePresentationCached(ctx context.Context, voiceText, legacyKey string, ch Channel) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if r == nil || voiceText == "" {
		return "", nil
	}
	cfg := r.config.Load()
	if cfg == nil {
		return "", nil
	}
	ac := cfg.(*AudioConfig)
	lang, voice := ac.Lang(ch), ac.Voice(ch)
	if r.cache != nil {
		key := r.cache.Key(lang, voice, voiceText)
		if path := r.cache.Get(key); path != "" {
			if err := ctx.Err(); err != nil {
				return "", err
			}
			return path, nil
		}
	}
	if r.cacheDir == "" || legacyKey == "" {
		return "", nil
	}
	info, err := os.Stat(filepath.Join(r.cacheDir, lang, voice, legacyKey+".mp3"))
	if ctxErr := ctx.Err(); ctxErr != nil {
		return "", ctxErr
	}
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil || info.IsDir() {
		return "", err
	}
	return filepath.Join(r.cacheDir, lang, voice, legacyKey+".mp3"), nil
}

// SetConfig atomically swaps the config. Nil-safe: nil receiver or nil config
// are no-ops.
func (r *AudioRouter) SetConfig(config *AudioConfig) {
	if r == nil || config == nil {
		return
	}
	r.config.Store(config)
}
