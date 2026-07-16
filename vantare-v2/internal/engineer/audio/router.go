// Package audio provides configuration for multi-language TTS audio.
// Each "channel" (spotter, engineer) can have independent language and voice settings.
package audio

import (
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
	cacheDir string
}

// NewAudioRouter builds an AudioRouter. All parameters are optional — nil-safe
// handling is built into Resolve and SetConfig.
func NewAudioRouter(config *AudioConfig, engine *tts.Engine, cacheDir string) *AudioRouter {
	r := &AudioRouter{
		engine:   engine,
		cacheDir: cacheDir,
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

// SetConfig atomically swaps the config. Nil-safe: nil receiver or nil config
// are no-ops.
func (r *AudioRouter) SetConfig(config *AudioConfig) {
	if r == nil || config == nil {
		return
	}
	r.config.Store(config)
}
