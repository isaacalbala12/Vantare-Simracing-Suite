package app_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestDefaultAppSettings(t *testing.T) {
	s := app.DefaultAppSettings()
	if s == nil {
		t.Fatal("expected non-nil defaults")
	}
	if s.DeltaMode != "self" {
		t.Errorf("expected deltaMode=self, got %q", s.DeltaMode)
	}
	if !s.CpuSampling {
		t.Errorf("expected cpuSampling=true")
	}
	if len(s.Hotkeys) != 3 {
		t.Errorf("expected 3 hotkeys, got %d", len(s.Hotkeys))
	}
	if s.Hotkeys["toggleOverlay"] != "ctrl+shift+v" {
		t.Errorf("unexpected toggleOverlay: %q", s.Hotkeys["toggleOverlay"])
	}
}

func TestSettingsServiceLoadSave(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter)

	// Load non-existent file -> should get defaults
	if err := svc.Load(); err != nil {
		t.Fatalf("Load on missing file: %v", err)
	}
	s := svc.Settings()
	if s.DeltaMode != "self" {
		t.Errorf("expected default deltaMode=self, got %q", s.DeltaMode)
	}

	// Save custom settings
	custom := app.DefaultAppSettings()
	custom.DeltaMode = "session"
	custom.CpuSampling = false
	custom.Hotkeys["toggleOverlay"] = "alt+v"
	if err := svc.Save(custom); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Load from disk into a fresh service
	svc2 := app.NewSettingsService(path, emitter)
	if err := svc2.Load(); err != nil {
		t.Fatalf("Load after save: %v", err)
	}
	s2 := svc2.Settings()
	if s2.DeltaMode != "session" {
		t.Errorf("expected deltaMode=session, got %q", s2.DeltaMode)
	}
	if s2.CpuSampling {
		t.Errorf("expected cpuSampling=false")
	}
	if s2.Hotkeys["toggleOverlay"] != "alt+v" {
		t.Errorf("expected toggleOverlay=alt+v, got %q", s2.Hotkeys["toggleOverlay"])
	}
}

func TestSettingsServiceLoadDefaultsOnCorruptFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "corrupt.json")

	// Write invalid JSON
	if err := os.WriteFile(path, []byte("{not json}"), 0644); err != nil {
		t.Fatal(err)
	}

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter)
	err := svc.Load()
	if err == nil {
		t.Fatal("expected error on corrupt file")
	}

	// Settings should still be defaults despite error
	s := svc.Settings()
	if s.DeltaMode != "self" {
		t.Errorf("expected defaults on error, got %q", s.DeltaMode)
	}
}

func TestSettingsServiceSaveInvalidDeltaMode(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter)
	_ = svc.Load()

	custom := app.DefaultAppSettings()
	custom.DeltaMode = "invalid"
	err := svc.Save(custom)
	if err == nil {
		t.Fatal("expected error for invalid delta mode")
	}
}

func TestSettingsServiceSaveEmptyHotkey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter)
	_ = svc.Load()

	custom := app.DefaultAppSettings()
	custom.Hotkeys["toggleOverlay"] = ""
	err := svc.Save(custom)
	if err == nil {
		t.Fatal("expected error for empty hotkey")
	}
}

func TestSettingsServiceSaveNilSettings(t *testing.T) {
	emitter := &spyEmitter{}
	svc := app.NewSettingsService("", emitter)
	err := svc.Save(nil)
	if err == nil {
		t.Fatal("expected error for nil settings")
	}
}

func TestValidateHotkeyCombo(t *testing.T) {
	tests := []struct {
		combo   string
		wantErr bool
	}{
		{"ctrl+shift+v", false},
		{"alt+v", false},
		{"ctrl+alt+shift+win+f1", false},
		{"", true},
		{"v", true},
		{"ctrl+", true},
		{"badmod+v", true},
	}
	for _, tt := range tests {
		err := app.ValidateHotkeyCombo(tt.combo)
		gotErr := err != nil
		if gotErr != tt.wantErr {
			t.Errorf("ValidateHotkeyCombo(%q) err=%v, wantErr=%v", tt.combo, err, tt.wantErr)
		}
	}
}

func TestSettingsServiceMergePersistedWithDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	// Write partial settings (only delta mode, no hotkeys)
	partial := `{"deltaMode":"global","cpuSampling":false}`
	if err := os.WriteFile(path, []byte(partial), 0644); err != nil {
		t.Fatal(err)
	}

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	s := svc.Settings()
	if s.DeltaMode != "global" {
		t.Errorf("expected deltaMode=global, got %q", s.DeltaMode)
	}
	if s.CpuSampling {
		t.Errorf("expected cpuSampling=false")
	}
	// Hotkeys should still be defaults
	if s.Hotkeys["toggleOverlay"] != "ctrl+shift+v" {
		t.Errorf("expected default toggleOverlay, got %q", s.Hotkeys["toggleOverlay"])
	}
}
