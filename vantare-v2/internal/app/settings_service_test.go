package app_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
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
	if len(s.Hotkeys) != 4 {
		t.Errorf("expected 4 hotkeys, got %d", len(s.Hotkeys))
	}
	if s.Hotkeys["toggleOverlay"] != "ctrl+shift+v" {
		t.Errorf("unexpected toggleOverlay: %q", s.Hotkeys["toggleOverlay"])
	}
	if s.Hotkeys["toggleEditMode"] != "ctrl+shift+e" {
		t.Errorf("unexpected toggleEditMode: %q", s.Hotkeys["toggleEditMode"])
	}
}

func TestDefaultAppSettingsIncludesToggleEditMode(t *testing.T) {
	s := app.DefaultAppSettings()
	combo, ok := s.Hotkeys["toggleEditMode"]
	if !ok {
		t.Fatal("expected toggleEditMode in default hotkeys")
	}
	if combo != "ctrl+shift+e" {
		t.Errorf("expected toggleEditMode=ctrl+shift+e, got %q", combo)
	}
	if err := app.ValidateHotkeyCombo(combo); err != nil {
		t.Errorf("toggleEditMode combo invalid: %v", err)
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
	if err != nil {
		t.Fatalf("load should not error on corrupt file (falls back to defaults): %v", err)
	}

	// Settings should be defaults despite corruption
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
	if err := svc.Save(custom); err != nil {
		t.Fatalf("Save should succeed but got: %v", err)
	}
	// Verify the invalid delta mode is persisted (validation moved to caller)
	loaded := app.NewSettingsService(path, nil)
	if err := loaded.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Settings().DeltaMode != "invalid" {
		t.Errorf("expected DeltaMode=invalid to be persisted, got %q", loaded.Settings().DeltaMode)
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
	if err := svc.Save(custom); err != nil {
		t.Fatalf("Save should succeed but got: %v", err)
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

func TestDefaultAppSettingsHasEmptyActiveOverlayProfileID(t *testing.T) {
	s := app.DefaultAppSettings()
	if s.ActiveOverlayProfileID != "" {
		t.Errorf("expected empty ActiveOverlayProfileID, got %q", s.ActiveOverlayProfileID)
	}
}

func TestSettingsServiceLoadSaveActiveOverlayProfileID(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	custom := app.DefaultAppSettings()
	custom.ActiveOverlayProfileID = "custom-my-profile"
	if err := svc.Save(custom); err != nil {
		t.Fatalf("Save: %v", err)
	}

	svc2 := app.NewSettingsService(path, emitter)
	if err := svc2.Load(); err != nil {
		t.Fatalf("Load after save: %v", err)
	}
	if svc2.Settings().ActiveOverlayProfileID != "custom-my-profile" {
		t.Errorf("expected ActiveOverlayProfileID=custom-my-profile, got %q", svc2.Settings().ActiveOverlayProfileID)
	}
}

func TestSettingsServiceMergeKeepsActiveOverlayProfileID(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	partial := `{"deltaMode":"self","cpuSampling":true,"activeOverlayProfileId":"custom-saved"}`
	if err := os.WriteFile(path, []byte(partial), 0644); err != nil {
		t.Fatal(err)
	}

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	if svc.Settings().ActiveOverlayProfileID != "custom-saved" {
		t.Errorf("expected ActiveOverlayProfileID=custom-saved, got %q", svc.Settings().ActiveOverlayProfileID)
	}
}

func TestDefaultAppSettingsBetaWelcomeCompleted(t *testing.T) {
	s := app.DefaultAppSettings()
	if s.BetaWelcomeCompleted {
		t.Errorf("expected BetaWelcomeCompleted false by default, got true")
	}
}

func TestSettingsServicePersistsBetaWelcomeCompleted(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)

	custom := app.DefaultAppSettings()
	custom.BetaWelcomeCompleted = true
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}

	loaded := app.NewSettingsService(path, nil)
	if err := loaded.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if !loaded.Settings().BetaWelcomeCompleted {
		t.Errorf("expected BetaWelcomeCompleted true after load, got false")
	}
}

func TestDefaultAppSettingsBetaUserRoleEmpty(t *testing.T) {
	s := app.DefaultAppSettings()
	if s.BetaUserRole != "" {
		t.Errorf("expected BetaUserRole empty by default, got %q", s.BetaUserRole)
	}
}

func TestSettingsServicePersistsBetaUserRole(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)

	custom := app.DefaultAppSettings()
	custom.BetaUserRole = "creator"
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}

	loaded := app.NewSettingsService(path, nil)
	if err := loaded.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.Settings().BetaUserRole != "creator" {
		t.Errorf("expected BetaUserRole=creator after load, got %q", loaded.Settings().BetaUserRole)
	}
}

func TestSettingsServiceMergeKeepsBetaUserRole(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	partial := `{"deltaMode":"self","cpuSampling":true,"betaUserRole":"organizer"}`
	if err := os.WriteFile(path, []byte(partial), 0644); err != nil {
		t.Fatal(err)
	}

	svc := app.NewSettingsService(path, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if svc.Settings().BetaUserRole != "organizer" {
		t.Errorf("expected BetaUserRole=organizer after merge, got %q", svc.Settings().BetaUserRole)
	}
}

func TestSettingsServiceSaveProducesValidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	svc := app.NewSettingsService(path, nil)
	custom := app.DefaultAppSettings()
	custom.DeltaMode = "session"
	if err := svc.Save(custom); err != nil {
		t.Fatalf("Save: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading saved file: %v", err)
	}
	if !json.Valid(raw) {
		t.Fatalf("saved file is not valid JSON: %s", string(raw))
	}
}

func TestSettingsServicePersistsLauncherApps(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)
	_ = svc.Load()
	custom := app.DefaultAppSettings()
	custom.LauncherApps = map[string]app.LauncherAppEntry{
		"obs": {ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS", Category: app.AppCategoryStreaming, LaunchMethod: "executable", Detected: true, GradientFrom: "#302e31", GradientTo: "#0a0a0a"},
	}
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}
	loaded := app.NewSettingsService(path, nil)
	if err := loaded.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(loaded.Settings().LauncherApps) != 1 {
		t.Fatalf("expected 1 app, got %d", len(loaded.Settings().LauncherApps))
	}
	if loaded.Settings().LauncherApps["obs"].DisplayName != "OBS Studio" {
		t.Errorf("unexpected app name")
	}
}

func TestSettingsServicePersistsLauncherProfiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)
	_ = svc.Load()
	custom := app.DefaultAppSettings()
	custom.LauncherProfiles = []app.LaunchProfile{
		{ID: "creator", Name: "Creador de Contenido", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}, {AppID: "obs", Delay: 2}}},
	}
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}
	loaded := app.NewSettingsService(path, nil)
	if err := loaded.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(loaded.Settings().LauncherProfiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(loaded.Settings().LauncherProfiles))
	}
	if loaded.Settings().LauncherProfiles[0].Steps[1].Delay != 2 {
		t.Errorf("expected delay 2, got %d", loaded.Settings().LauncherProfiles[0].Steps[1].Delay)
	}
}

func TestDefaultAppSettingsIncludesDefaultProfiles(t *testing.T) {
	s := app.DefaultAppSettings()
	if len(s.LauncherProfiles) != 2 {
		t.Fatalf("expected 2 default profiles, got %d", len(s.LauncherProfiles))
	}
	if s.LauncherProfiles[0].ID != "creator" {
		t.Errorf("expected creator, got %s", s.LauncherProfiles[0].ID)
	}
	if s.LauncherProfiles[1].ID != "pro" {
		t.Errorf("expected pro, got %s", s.LauncherProfiles[1].ID)
	}
	if len(s.LauncherApps) != 1 {
		t.Fatalf("expected 1 default app (lmu), got %d", len(s.LauncherApps))
	}
}

func TestDefaultAppSettingsHasSchemaVersion1(t *testing.T) {
	s := app.DefaultAppSettings()
	if s.SchemaVersion != 1 {
		t.Fatalf("expected SchemaVersion=1, got %d", s.SchemaVersion)
	}
}

func TestSaveIsAtomic(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)
	_ = svc.Load()
	s := app.DefaultAppSettings()
	if err := svc.Save(s); err != nil {
		t.Fatalf("save: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Errorf("main should exist: %v", err)
	}
	s.DeltaMode = "relative"
	if err := svc.Save(s); err != nil {
		t.Fatalf("save 2: %v", err)
	}
	if _, err := os.Stat(path + ".bak"); err != nil {
		t.Errorf(".bak should exist after second save: %v", err)
	}
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Errorf(".tmp should not exist after successful save")
	}
	if _, err := os.Stat(path + ".failed"); !os.IsNotExist(err) {
		t.Errorf(".failed should not exist on success")
	}
}

func TestSaveRetriesOnLock(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)
	_ = svc.Load()

	// Create a directory at the .tmp path to simulate a lock
	tmpPath := path + ".tmp"
	if err := os.MkdirAll(tmpPath, 0o755); err != nil {
		t.Fatalf("mkdir tmp dir: %v", err)
	}

	s := app.DefaultAppSettings()
	err := svc.Save(s)
	if err == nil {
		t.Fatal("expected error when .tmp is locked by a directory")
	}
	// The .failed sidecar should exist after retries exhausted
	if _, err := os.Stat(path + ".failed"); os.IsNotExist(err) {
		t.Error(".failed should exist after retries exhausted")
	}
}

func TestLoadMigratesLegacySettings(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	legacy := `{
		"deltaMode": "self",
		"cpuSampling": true,
		"hotkeys": {}
	}`
	if err := os.WriteFile(path, []byte(legacy), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	svc := app.NewSettingsService(path, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if svc.Settings().SchemaVersion != 1 {
		t.Errorf("expected SchemaVersion=1 after migration, got %d", svc.Settings().SchemaVersion)
	}
	if svc.Settings().LauncherApps == nil {
		t.Error("LauncherApps should be initialized")
	}
	if svc.Settings().LauncherProfiles == nil {
		t.Error("LauncherProfiles should be initialized")
	}
}

func TestLoadToleratesCorruptedJSONFallsBackToBak(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	bakPath := path + ".bak"
	if err := os.WriteFile(path, []byte("{ \"deltaMode\":"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(bakPath, []byte(`{"schemaVersion": 1, "deltaMode": "self", "cpuSampling": true, "hotkeys": {}, "launcherApps": {}, "launcherProfiles": []}`), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := app.NewSettingsService(path, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if svc.Settings().DeltaMode != "self" {
		t.Errorf("expected DeltaMode=self from .bak, got %s", svc.Settings().DeltaMode)
	}
}

func TestLoadFallsBackToDefaultsOnTotalCorruption(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	bakPath := path + ".bak"
	os.WriteFile(path, []byte("garbage"), 0o644)
	os.WriteFile(bakPath, []byte("also garbage"), 0o644)
	svc := app.NewSettingsService(path, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load should not panic: %v", err)
	}
	if svc.Settings().SchemaVersion != 1 {
		t.Errorf("expected defaults with SchemaVersion=1")
	}
	if svc.Settings().LauncherProfiles == nil {
		t.Error("expected default profiles")
	}
}

func TestSidecarAppliedOnStartup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	sidecarPath := path + ".failed"
	if err := os.WriteFile(sidecarPath, []byte(`{"schemaVersion": 1, "deltaMode": "absolute", "cpuSampling": true, "hotkeys": {}, "launcherApps": {}, "launcherProfiles": [{"id":"x","name":"X","steps":[]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := app.NewSettingsService(path, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if svc.Settings().DeltaMode != "absolute" {
		t.Errorf("expected sidecar applied, got %s", svc.Settings().DeltaMode)
	}
	if len(svc.Settings().LauncherProfiles) != 1 {
		t.Errorf("expected 1 profile from sidecar")
	}
	if _, err := os.Stat(sidecarPath); !os.IsNotExist(err) {
		t.Errorf("sidecar should be removed after applied")
	}
}

func TestSettingsWriteMutexSerializesConcurrentWrites(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)
	_ = svc.Load()

	const N = 20
	var wg sync.WaitGroup
	errs := make(chan error, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s := app.DefaultAppSettings()
			s.LauncherApps = map[string]app.LauncherAppEntry{
				"k": {ID: "k", DisplayName: "K" + string(rune('a'+i%26)), Abbreviation: "K", Category: app.AppCategoryUtility, LaunchMethod: "executable", Detected: true, GradientFrom: "#000", GradientTo: "#fff"},
			}
			errs <- svc.Save(s)
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("concurrent save error: %v", err)
		}
	}
	// El archivo final debe ser JSON válido.
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var s app.AppSettings
	if err := json.Unmarshal(data, &s); err != nil {
		t.Errorf("final file must be valid JSON: %v", err)
	}
}
