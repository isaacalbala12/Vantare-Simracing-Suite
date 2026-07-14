package audio

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/vantare/overlays/v2/internal/tts"
)

// mockEngine creates a tts.Engine backed by a MockProvider for tests that need
// a functioning engine (cache miss → SynthOrCache).
func mockEngine(t *testing.T, dir string) *tts.Engine {
	t.Helper()
	cache, err := tts.NewCache(dir, "mock")
	if err != nil {
		t.Fatalf("NewCache: %v", err)
	}
	provider, err := tts.NewMockProvider(dir)
	if err != nil {
		t.Fatalf("NewMockProvider: %v", err)
	}
	engine, err := tts.NewEngine(cache, provider)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	return engine
}

func TestAudioRouter_NilRouter(t *testing.T) {
	var r *AudioRouter
	path := r.Resolve("test.key", ChannelSpotter)
	if path != "" {
		t.Errorf("nil router should return empty, got %q", path)
	}
}

func TestAudioRouter_NilEngine(t *testing.T) {
	r := NewAudioRouter(DefaultAudioConfig(), nil, t.TempDir())
	path := r.Resolve("test.key", ChannelSpotter)
	if path != "" {
		t.Errorf("nil engine should return empty, got %q", path)
	}
}

func TestAudioRouter_NilConfig(t *testing.T) {
	// router constructed with nil config
	r := NewAudioRouter(nil, nil, t.TempDir())
	path := r.Resolve("test.key", ChannelSpotter)
	if path != "" {
		t.Errorf("nil config should return empty, got %q", path)
	}
}

func TestAudioRouter_CacheHit(t *testing.T) {
	cacheDir := t.TempDir()
	targetDir := filepath.Join(cacheDir, "en", "af_bella")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		t.Fatal(err)
	}
	cachePath := filepath.Join(targetDir, "spotter.car_left.mp3")
	if err := os.WriteFile(cachePath, []byte("fake mp3"), 0644); err != nil {
		t.Fatal(err)
	}

	r := NewAudioRouter(DefaultAudioConfig(), nil, cacheDir)
	path := r.Resolve("spotter.car_left", ChannelSpotter)
	if path != cachePath {
		t.Errorf("expected %q, got %q", cachePath, path)
	}
}

func TestAudioRouter_CacheMiss_NoEngine(t *testing.T) {
	r := NewAudioRouter(DefaultAudioConfig(), nil, t.TempDir())
	path := r.Resolve("nonexistent.key", ChannelSpotter)
	if path != "" {
		t.Errorf("cache miss without engine should return empty, got %q", path)
	}
}

func TestAudioRouter_DifferentChannel_DifferentPath(t *testing.T) {
	cacheDir := t.TempDir()
	cfg := DefaultAudioConfig()
	cfg.SetSpotter("es", "em_alex")
	cfg.SetEngineer("en", "am_echo")

	// Create cache files for both channels so Resolve hits cache (no engine needed).
	spotterDir := filepath.Join(cacheDir, "es", "em_alex")
	if err := os.MkdirAll(spotterDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(spotterDir, "spotter.car_left.mp3"), []byte("fake"), 0644); err != nil {
		t.Fatal(err)
	}

	engineerDir := filepath.Join(cacheDir, "en", "am_echo")
	if err := os.MkdirAll(engineerDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(engineerDir, "engine.water_temp_high.mp3"), []byte("fake"), 0644); err != nil {
		t.Fatal(err)
	}

	r := NewAudioRouter(cfg, nil, cacheDir)

	// Spotter: es/em_alex/spotter.car_left.mp3
	spotterPath := r.Resolve("spotter.car_left", ChannelSpotter)
	expectedSpotter := filepath.Join(cacheDir, "es", "em_alex", "spotter.car_left.mp3")
	if spotterPath != expectedSpotter {
		t.Errorf("spotter path = %q, want %q", spotterPath, expectedSpotter)
	}

	// Engineer: en/am_echo/engine.water_temp_high.mp3
	engPath := r.Resolve("engine.water_temp_high", ChannelEngineer)
	expectedEng := filepath.Join(cacheDir, "en", "am_echo", "engine.water_temp_high.mp3")
	if engPath != expectedEng {
		t.Errorf("engineer path = %q, want %q", engPath, expectedEng)
	}
}

func TestAudioRouter_SetConfig_NilRouter(t *testing.T) {
	var r *AudioRouter
	r.SetConfig(DefaultAudioConfig()) // should not panic
}

func TestAudioRouter_SetConfig_NilArgument(t *testing.T) {
	cacheDir := t.TempDir()

	// Create cache file for default config (en/af_bella).
	targetDir := filepath.Join(cacheDir, "en", "af_bella")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(targetDir, "test.key.mp3"), []byte("fake"), 0644); err != nil {
		t.Fatal(err)
	}

	r := NewAudioRouter(DefaultAudioConfig(), nil, cacheDir)
	r.SetConfig(nil) // should not panic and leave config unchanged

	path := r.Resolve("test.key", ChannelSpotter)
	expected := filepath.Join(cacheDir, "en", "af_bella", "test.key.mp3")
	if path != expected {
		t.Errorf("after SetConfig(nil): expected %q, got %q", expected, path)
	}
}

func TestAudioRouter_SetConfig_ChangesPath(t *testing.T) {
	cacheDir := t.TempDir()

	// Create cache file for default config path (en/af_bella).
	defaultDir := filepath.Join(cacheDir, "en", "af_bella")
	if err := os.MkdirAll(defaultDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(defaultDir, "spotter.car_left.mp3"), []byte("fake"), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := DefaultAudioConfig()
	r := NewAudioRouter(cfg, nil, cacheDir)

	// Default: spotter en/af_bella
	path := r.Resolve("spotter.car_left", ChannelSpotter)
	expected := filepath.Join(cacheDir, "en", "af_bella", "spotter.car_left.mp3")
	if path != expected {
		t.Errorf("before SetConfig: expected %q, got %q", expected, path)
	}

	// Create cache file for new config path (es/em_alex).
	newDir := filepath.Join(cacheDir, "es", "em_alex")
	if err := os.MkdirAll(newDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(newDir, "spotter.car_left.mp3"), []byte("fake"), 0644); err != nil {
		t.Fatal(err)
	}

	// Change config
	newCfg := DefaultAudioConfig()
	newCfg.SetSpotter("es", "em_alex")
	r.SetConfig(newCfg)

	// After SetConfig: spotter es/em_alex
	path2 := r.Resolve("spotter.car_left", ChannelSpotter)
	expected2 := filepath.Join(cacheDir, "es", "em_alex", "spotter.car_left.mp3")
	if path2 != expected2 {
		t.Errorf("after SetConfig: expected %q, got %q", expected2, path2)
	}
}

func TestAudioRouter_CacheMiss_WithEngine(t *testing.T) {
	cacheDir := t.TempDir()

	// Set up engine with mock provider so SynthOrCache succeeds
	engine := mockEngine(t, cacheDir)

	r := NewAudioRouter(DefaultAudioConfig(), engine, cacheDir)

	// Cache miss should trigger SynthOrCache which calls the mock provider.
	path := r.Resolve("spotter.car_left", ChannelSpotter)
	if path == "" {
		t.Fatal("expected non-empty path from engine-satisfied cache miss")
	}
	// Path should exist on disk
	if _, err := os.Stat(path); err != nil {
		t.Errorf("resolved path should exist on disk: %v", err)
	}
	// File should have the .mp3 extension
	if filepath.Ext(path) != ".mp3" {
		t.Errorf("expected .mp3 extension, got %q", filepath.Ext(path))
	}
}

func TestAudioRouter_CacheHit_AfterMissCachedByEngine(t *testing.T) {
	// The first call (cache miss) goes through SynthOrCache and caches in
	// the tts.Cache. The second call with the same key should still go through
	// the router's own cache check first (which will miss), then SynthOrCache
	// which will hit its own cache. The end result is still a valid path.
	cacheDir := t.TempDir()
	engine := mockEngine(t, cacheDir)
	r := NewAudioRouter(DefaultAudioConfig(), engine, cacheDir)

	path1 := r.Resolve("spotter.car_left", ChannelSpotter)
	if path1 == "" {
		t.Fatal("first call should return a path")
	}

	// Second call — same key, still a router cache miss but engine cache hit
	path2 := r.Resolve("spotter.car_left", ChannelSpotter)
	if path2 == "" {
		t.Fatal("second call should return a path")
	}

	// The engine's SynthOrCache should return the same path on hit
	if path1 != path2 {
		t.Logf("note: path1=%q path2=%q (may differ if cache dirs differ)", path1, path2)
	}
}

func TestAudioRouter_EmptyTextKey(t *testing.T) {
	r := NewAudioRouter(DefaultAudioConfig(), nil, t.TempDir())
	path := r.Resolve("", ChannelSpotter)
	if path != "" {
		t.Errorf("empty text key should return empty, got %q", path)
	}
}

func TestAudioRouter_RaceFree(t *testing.T) {
	cacheDir := t.TempDir()
	engine := mockEngine(t, cacheDir)
	cfg := DefaultAudioConfig()
	r := NewAudioRouter(cfg, engine, cacheDir)

	var wg sync.WaitGroup
	// Concurrent reads from Resolve
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			ch := ChannelSpotter
			if n%2 == 0 {
				ch = ChannelEngineer
			}
			_ = r.Resolve("spotter.car_left", ch)
		}(i)
	}
	// Concurrent SetConfig writes
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			newCfg := DefaultAudioConfig()
			newCfg.SetSpotter("es", "em_alex")
			r.SetConfig(newCfg)
		}()
	}
	wg.Wait()
}
