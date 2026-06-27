package tts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCache_NewAndKeyDeterminism(t *testing.T) {
	dir := t.TempDir()
	c, err := NewCache(dir, "mock")
	if err != nil {
		t.Fatalf("NewCache: %v", err)
	}
	if c.Root() == "" {
		t.Fatal("Root empty")
	}

	k1 := c.Key("es", "es-ES-Elvira", "Coche a la izquierda")
	k2 := c.Key("es", "es-ES-Elvira", "Coche a la izquierda")
	if k1 != k2 {
		t.Errorf("same request -> different keys: %q vs %q", k1, k2)
	}

	k3 := c.Key("es", "es-ES-Elvira", "Libre")
	if k1 == k3 {
		t.Error("different text should produce different keys")
	}

	if !strings.HasSuffix(c.Path(k1), ".mp3") {
		t.Errorf("Path should end in .mp3, got %q", c.Path(k1))
	}
}

func TestCache_Get_Put_Has(t *testing.T) {
	dir := t.TempDir()
	c, err := NewCache(dir, "mock")
	if err != nil {
		t.Fatal(err)
	}

	key := c.Key("es", "v", "hola")
	if c.Has(key) {
		t.Error("empty cache should miss")
	}
	if got := c.Get(key); got != "" {
		t.Errorf("Get on empty cache = %q, want \"\"", got)
	}

	// Write a source file and Put it.
	src := filepath.Join(dir, "src.mp3")
	if err := os.WriteFile(src, []byte("ID3fakebytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	dst, err := c.Put(key, src)
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if !c.Has(key) {
		t.Error("Has should be true after Put")
	}
	if got := c.Get(key); got != dst {
		t.Errorf("Get = %q, want %q", got, dst)
	}
}

func TestEngine_SynthOrCache_Hit(t *testing.T) {
	cacheDir := t.TempDir()
	outDir := t.TempDir()
	c, _ := NewCache(cacheDir, "mock")
	p, _ := NewMockProvider(outDir)
	e, err := NewEngine(c, p)
	if err != nil {
		t.Fatal(err)
	}

	req := Request{Language: "es", Voice: "v", Text: "spotter.car_left"}

	// Pre-populate cache manually so first call hits.
	src := filepath.Join(cacheDir, "seed.mp3")
	os.WriteFile(src, []byte("ID3seed"), 0o644)
	c.Put(c.Key("es", "v", "spotter.car_left"), src)

	beforeCalls := p.CallCount()
	path, err := e.SynthOrCache(req)
	if err != nil {
		t.Fatalf("SynthOrCache: %v", err)
	}
	if path == "" {
		t.Fatal("path empty")
	}
	if p.CallCount() != beforeCalls {
		t.Errorf("cache hit should not call provider; got %d calls", p.CallCount())
	}
}

func TestEngine_SynthOrCache_Miss(t *testing.T) {
	cacheDir := t.TempDir()
	outDir := t.TempDir()
	c, _ := NewCache(cacheDir, "mock")
	p, _ := NewMockProvider(outDir)
	e, _ := NewEngine(c, p)

	req := Request{Language: "es", Voice: "v", Text: "spotter.car_right"}
	path, err := e.SynthOrCache(req)
	if err != nil {
		t.Fatalf("SynthOrCache: %v", err)
	}
	if path == "" {
		t.Fatal("path empty")
	}
	if p.CallCount() != 1 {
		t.Errorf("expected 1 provider call, got %d", p.CallCount())
	}
	// Cache should now hold the file under the canonical key.
	if !c.Has(c.Key("es", "v", "spotter.car_right")) {
		t.Error("cache should have the file after a miss")
	}

	// Second call hits cache.
	path2, _ := e.SynthOrCache(req)
	if path2 != path {
		t.Errorf("second call path %q != first %q", path2, path)
	}
	if p.CallCount() != 1 {
		t.Errorf("second call should hit cache; provider calls=%d", p.CallCount())
	}
}

func TestEngine_SynthOrCache_NoProvider(t *testing.T) {
	dir := t.TempDir()
	c, _ := NewCache(dir, "mock")
	e, err := NewEngine(c, nil)
	if err == nil {
		t.Fatal("NewEngine(nil provider) should error")
	}
	if e != nil {
		t.Errorf("expected nil engine on error")
	}
}

func TestEngine_SynthOrCache_EmptyText(t *testing.T) {
	dir := t.TempDir()
	c, _ := NewCache(dir, "mock")
	p, _ := NewMockProvider(t.TempDir())
	e, _ := NewEngine(c, p)
	if _, err := e.SynthOrCache(Request{}); err == nil {
		t.Error("empty text should error")
	}
}

func TestMockProvider_OutputValidMP3Header(t *testing.T) {
	p, _ := NewMockProvider(t.TempDir())
	res, err := p.Synthesize(Request{Language: "es", Voice: "v", Text: "hola"})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(res.Path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 12 {
		t.Fatalf("output too small: %d bytes", len(data))
	}
	if string(data[0:3]) != "ID3" {
		t.Errorf("expected ID3 header, got %q", data[0:3])
	}
	if data[10] != 0xFF || data[11] != 0xFB {
		t.Errorf("expected MP3 sync at [10..11], got %x %x", data[10], data[11])
	}
}

func TestMockProvider_Name(t *testing.T) {
	p, _ := NewMockProvider(t.TempDir())
	if got := p.Name(); got != "mock" {
		t.Errorf("Name = %q, want mock", got)
	}
}

func TestCriticalKeys_Returns7SpotterKeys(t *testing.T) {
	keys := CriticalKeys()
	if len(keys) != 7 {
		t.Fatalf("expected 7 critical keys, got %d", len(keys))
	}
	expected := map[string]bool{
		"spotter.car_left": true, "spotter.car_right": true,
		"spotter.still_there": true, "spotter.clear_left": true,
		"spotter.clear_right": true, "spotter.all_clear": true,
		"spotter.three_wide": true,
	}
	for _, k := range keys {
		if !expected[k] {
			t.Errorf("unexpected critical key %q", k)
		}
	}
}

func TestEngine_PrecacheSynth(t *testing.T) {
	cacheDir := t.TempDir()
	outDir := t.TempDir()
	c, _ := NewCache(cacheDir, "mock")
	p, _ := NewMockProvider(outDir)
	e, _ := NewEngine(c, p)

	paths, errs := e.PrecacheSynth("es", "es-ES-Elvira")
	if len(errs) > 0 {
		t.Errorf("unexpected precache errors: %v", errs)
	}
	if len(paths) != 7 {
		t.Errorf("expected 7 paths, got %d", len(paths))
	}
	for i, p := range paths {
		if _, err := os.Stat(p); err != nil {
			t.Errorf("path %d (%s) missing: %v", i, p, err)
		}
	}
	if p.CallCount() != 7 {
		t.Errorf("expected 7 provider calls, got %d", p.CallCount())
	}
}

func TestDefaultCacheRoot(t *testing.T) {
	root := DefaultCacheRoot()
	if root == "" {
		// Possible on stripped CI; not a failure in itself.
		t.Skip("no usable home directory; cannot assert default root")
	}
	if !filepath.IsAbs(root) {
		t.Errorf("DefaultCacheRoot should be absolute, got %q", root)
	}
}