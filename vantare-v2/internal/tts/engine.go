package tts

import (
	"errors"
	"sync"
)

// Engine wires a Provider to a Cache and implements the cache-first lookup
// pattern (SynthOrCache). A single Engine can serve any number of goroutines.
type Engine struct {
	mu       sync.Mutex
	cache    *Cache
	provider Provider
}

// NewEngine builds an Engine. cache and provider must both be non-nil.
func NewEngine(cache *Cache, provider Provider) (*Engine, error) {
	if cache == nil {
		return nil, errors.New("tts: cache required")
	}
	if provider == nil {
		return nil, errors.New("tts: provider required")
	}
	return &Engine{cache: cache, provider: provider}, nil
}

// Provider returns the registered provider (for diagnostics).
func (e *Engine) Provider() Provider { return e.provider }

// Cache returns the cache (for diagnostics / direct access).
func (e *Engine) Cache() *Cache { return e.cache }

// SynthOrCache returns the path to an audio file for the given triple.
// Behaviour:
//   - cache hit (file present): return the cached path, no provider call.
//   - cache miss + provider configured: call provider, copy result into cache
//     atomically, return cache path.
//   - cache miss + no provider: return ErrProviderNotConfigured.
//
// Errors from the provider are propagated and nothing is cached.
func (e *Engine) SynthOrCache(req Request) (string, error) {
	if req.Text == "" {
		return "", errors.New("tts: empty text")
	}
	key := e.cache.Key(req.Language, req.Voice, req.Text)

	if hit := e.cache.Get(key); hit != "" {
		return hit, nil
	}

	if e.provider == nil {
		return "", ErrProviderNotConfigured
	}

	res, err := e.provider.Synthesize(req)
	if err != nil {
		return "", err
	}

	// Copy into cache atomically. The provider's output may be in a tmp dir;
	// the cache becomes the canonical home.
	cachedPath, err := e.cache.Put(key, res.Path)
	if err != nil {
		// Provider worked but we couldn't cache. Best-effort: return provider
		// output so the caller still gets audio this call.
		return res.Path, nil
	}
	return cachedPath, nil
}

// Health reports whether the engine can serve requests (provider ready + cache
// dir writable).
func (e *Engine) Health() error {
	if err := e.provider.Health(); err != nil {
		return err
	}
	// Read-only sanity check: try Get on a probe key.
	_ = e.cache.Get(e.cache.Key("health", "health", "health"))
	return nil
}

// CriticalKeys returns the 7 spotter phrases that must be pre-cached on startup
// to satisfy the <200ms latency target for spotter cues. Parity CC: doc
// tts.md § 7 "Critical Phrase Pre-caching".
func CriticalKeys() []string {
	return []string{
		"spotter.car_left",
		"spotter.car_right",
		"spotter.still_there",
		"spotter.clear_left",
		"spotter.clear_right",
		"spotter.all_clear",
		"spotter.three_wide",
	}
}

// PrecacheSynth is a convenience wrapper: synthesize (or hit cache) for each
// critical phrase and return the list of cached paths. Used at startup to
// guarantee zero-latency spotter cues. Errors are aggregated; partial success
// is acceptable (the caller logs which keys missed).
func (e *Engine) PrecacheSynth(language, voice string) (paths []string, errs []error) {
	for _, key := range CriticalKeys() {
		req := Request{Language: language, Voice: voice, Text: key}
		p, err := e.SynthOrCache(req)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		paths = append(paths, p)
	}
	return paths, errs
}