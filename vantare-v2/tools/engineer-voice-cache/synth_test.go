package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/tts"
)

func TestSynth_MockSmoke(t *testing.T) {
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "catalog-voice.v1.json")
	cacheRoot := filepath.Join(dir, "tts-cache")
	modelsLock := filepath.Join(dir, "voice-models.lock.json")
	cacheLock := filepath.Join(dir, "voice-cache.lock.json")

	// generate manifest to temp
	if err := run([]string{"--catalog", "../../docs/engineer/catalog-v1.md", "--manifest", manifestPath}); err != nil {
		t.Fatalf("manifest: %v", err)
	}
	_ = os.WriteFile(modelsLock, []byte(`{"schema":"x"}`), 0o644)

	if err := synthManifest(manifestPath, cacheRoot, "mock", modelsLock, cacheLock, ""); err != nil {
		t.Fatalf("synth mock: %v", err)
	}
	data, err := os.ReadFile(cacheLock)
	if err != nil {
		t.Fatalf("read lock: %v", err)
	}
	var lock CacheLock
	if err := json.Unmarshal(data, &lock); err != nil {
		t.Fatalf("parse lock: %v", err)
	}
	if lock.TotalClips == 0 {
		t.Fatal("expected clips >0")
	}
	if !lock.PendingReal {
		t.Error("mock should mark pendingReal true")
	}
	// verify cache is readable via tts.Cache and router
	cache, err := tts.NewCache(cacheRoot, "kokoro")
	if err != nil {
		t.Fatalf("new cache: %v", err)
	}
	// pick a static text
	key := cache.Key("es", "ef_dora", "Coche a la izquierda")
	if path := cache.Get(key); path == "" {
		t.Fatalf("cache miss for spotter.car_left es")
	}
	// verify router can resolve it via VoiceText
	cfg := audio.DefaultAudioConfig()
	cfg.SetEngineer("es", "ef_dora")
	// also need spotter config for that key? Use engineer channel for this voice text
	// create router bound to cache
	router := audio.NewCacheOnlyAudioRouter(cfg, cache)
	req := audio.PresentationRequest{Locale: "es", VoiceText: "Coche a la izquierda", Channel: audio.ChannelEngineer, LegacyIntent: "spotter.car_left"}
	got, err := router.ResolvePresentationCached(context.Background(), req)
	if err != nil {
		t.Fatalf("router: %v", err)
	}
	if got == "" {
		t.Fatal("router should find cached voiceText")
	}
	// check a number clip
	key2 := cache.Key("en", "af_bella", "42")
	if cache.Get(key2) == "" {
		t.Fatal("expected number clip 42 en")
	}
	// spotter WAV PCM: debe existir segundo artefacto .wav además del .mp3
	spotterKey := cache.Key("es", "ef_dora", "Coche a la izquierda")
	wavPath := filepath.Join(cache.Root(), spotterKey+".wav")
	wavData, err := os.ReadFile(wavPath)
	if err != nil {
		t.Fatalf("spotter wav missing at %s: %v", wavPath, err)
	}
	if len(wavData) < 44 || string(wavData[0:4]) != "RIFF" || string(wavData[8:12]) != "WAVE" {
		t.Fatalf("wav header invalid: %q", wavData[:12])
	}
	// must be PCM (audioFormat 1 at offset 20)
	if wavData[20] != 1 || wavData[21] != 0 {
		t.Fatalf("wav not PCM: %v", wavData[20:22])
	}
	// lock must count wavs
	wavCount := 0
	for _, c := range lock.Clips {
		if c.Format == "wav" {
			wavCount++
			if c.Intent != "spotter.car_left" && c.Intent != "spotter.car_right" && c.Intent != "spotter.still_there" && c.Intent != "spotter.clear_left" && c.Intent != "spotter.clear_right" && c.Intent != "spotter.all_clear" && c.Intent != "spotter.three_wide" {
				t.Fatalf("wav intent unexpected %q", c.Intent)
			}
		}
	}
	if wavCount != 28 {
		t.Fatalf("expected 28 spotter wavs (7*4), got %d", wavCount)
	}
	// ensure legacy fallback behavior not required: hash cache is authoritative
}

func TestSynth_Deduplication(t *testing.T) {
	// ensure synth deduplicates same text across intents (e.g., number 0 appears in many locales but once per locale)
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "catalog-voice.v1.json")
	if err := run([]string{"--catalog", "../../docs/engineer/catalog-v1.md", "--manifest", manifestPath}); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dir, "m.json"), []byte(`{}`), 0o644)
	cacheRoot := filepath.Join(dir, "cache")
	cacheLock := filepath.Join(dir, "lock.json")
	_ = synthManifest(manifestPath, cacheRoot, "mock", filepath.Join(dir, "m.json"), cacheLock, "")
	var lock CacheLock
	b, _ := os.ReadFile(cacheLock)
	_ = json.Unmarshal(b, &lock)
	// rough bound: static 184 + wavs 28 + numbers ~ 444 + literals ~155 => 807
	if lock.TotalClips < 700 || lock.TotalClips > 900 {
		t.Fatalf("unexpected totalClips %d", lock.TotalClips)
	}
	if lock.TotalBytes == 0 {
		t.Fatal("totalBytes 0")
	}
}
