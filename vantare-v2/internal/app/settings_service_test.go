package app_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestDefaultAppSettings(t *testing.T) {
	s := app.DefaultAppSettings()
	if s == nil {
		t.Fatal("expected non-nil defaults")
	}
	if !s.CpuSampling {
		t.Errorf("expected cpuSampling enabled by default")
	}
	if !s.CpuSampling {
		t.Errorf("expected cpuSampling=true")
	}
	if s.Performance.Mode != "level" || s.Performance.Level != 1 {
		t.Errorf("expected parity performance default, got %+v", s.Performance)
	}
	if len(s.Hotkeys) != 5 {
		t.Errorf("expected 5 hotkeys, got %d", len(s.Hotkeys))
	}
	if s.Hotkeys["toggleOverlay"] != "ctrl+shift+v" {
		t.Errorf("unexpected toggleOverlay: %q", s.Hotkeys["toggleOverlay"])
	}
	if s.Hotkeys["toggleEditMode"] != "ctrl+shift+e" {
		t.Errorf("unexpected toggleEditMode: %q", s.Hotkeys["toggleEditMode"])
	}
	if s.Hotkeys["cycleDeltaReference"] != "ctrl+shift+d" {
		t.Errorf("unexpected cycleDeltaReference: %q", s.Hotkeys["cycleDeltaReference"])
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
	svc := app.NewSettingsService(path, emitter, nil)

	// Load non-existent file -> should get defaults
	if err := svc.Load(); err != nil {
		t.Fatalf("Load on missing file: %v", err)
	}
	s := svc.Settings()
	if !s.CpuSampling {
		t.Errorf("expected default cpuSampling enabled")
	}

	// Save custom settings
	custom := app.DefaultAppSettings()
	custom.CpuSampling = false
	custom.CpuSampling = false
	custom.Hotkeys["toggleOverlay"] = "alt+v"
	if err := svc.Save(custom); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Load from disk into a fresh service
	svc2 := app.NewSettingsService(path, emitter, nil)
	if err := svc2.Load(); err != nil {
		t.Fatalf("Load after save: %v", err)
	}
	s2 := svc2.Settings()
	if s2.CpuSampling {
		t.Errorf("expected cpuSampling to persist as disabled")
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
	svc := app.NewSettingsService(path, emitter, nil)
	err := svc.Load()
	if err != nil {
		t.Fatalf("load should not error on corrupt file (falls back to defaults): %v", err)
	}

	// Settings should be defaults despite corruption
	s := svc.Settings()
	if !s.CpuSampling {
		t.Errorf("expected defaults on error, got cpuSampling disabled")
	}
}

func TestSettingsServiceSaveEmptyHotkey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter, nil)
	_ = svc.Load()

	custom := app.DefaultAppSettings()
	custom.Hotkeys["toggleOverlay"] = ""
	if err := svc.Save(custom); err != nil {
		t.Fatalf("Save should succeed but got: %v", err)
	}
}

func TestSettingsServiceSaveNilSettings(t *testing.T) {
	emitter := &spyEmitter{}
	svc := app.NewSettingsService("", emitter, nil)
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
	partial := `{"activeOverlayProfileId":"global","cpuSampling":false}`
	if err := os.WriteFile(path, []byte(partial), 0644); err != nil {
		t.Fatal(err)
	}

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	s := svc.Settings()
	if s.ActiveOverlayProfileID != "global" {
		t.Errorf("expected activeOverlayProfileId=global, got %q", s.ActiveOverlayProfileID)
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
	svc := app.NewSettingsService(path, emitter, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	custom := app.DefaultAppSettings()
	custom.ActiveOverlayProfileID = "custom-my-profile"
	if err := svc.Save(custom); err != nil {
		t.Fatalf("Save: %v", err)
	}

	svc2 := app.NewSettingsService(path, emitter, nil)
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

	partial := `{"activeOverlayProfileId":"self","cpuSampling":true,"activeOverlayProfileId":"custom-saved"}`
	if err := os.WriteFile(path, []byte(partial), 0644); err != nil {
		t.Fatal(err)
	}

	emitter := &spyEmitter{}
	svc := app.NewSettingsService(path, emitter, nil)
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
	svc := app.NewSettingsService(path, nil, nil)

	custom := app.DefaultAppSettings()
	custom.BetaWelcomeCompleted = true
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}

	loaded := app.NewSettingsService(path, nil, nil)
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
	svc := app.NewSettingsService(path, nil, nil)

	custom := app.DefaultAppSettings()
	custom.BetaUserRole = "creator"
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}

	loaded := app.NewSettingsService(path, nil, nil)
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

	partial := `{"activeOverlayProfileId":"self","cpuSampling":true,"betaUserRole":"organizer"}`
	if err := os.WriteFile(path, []byte(partial), 0644); err != nil {
		t.Fatal(err)
	}

	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if svc.Settings().BetaUserRole != "organizer" {
		t.Errorf("expected BetaUserRole=organizer after merge, got %q", svc.Settings().BetaUserRole)
	}
}

func TestConcurrentReadWriteNoRace(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	_ = svc.Load()
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			_ = svc.Settings()
		}()
		go func(i int) {
			defer wg.Done()
			s := app.DefaultAppSettings()
			s.ActiveOverlayProfileID = fmt.Sprintf("m-%d", i)
			_ = svc.Save(s)
		}(i)
	}
	wg.Wait()
}

func TestSidecarWithInvalidJSONIgnored(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	sidecarPath := path + ".failed"
	if err := os.WriteFile(sidecarPath, []byte("{\"schemaVersion\""), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if _, err := os.Stat(sidecarPath); !os.IsNotExist(err) {
		t.Errorf("invalid sidecar should be removed, got: %v", err)
	}
}

func TestSidecarStaleIsIgnored(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	sidecarPath := path + ".failed"
	// main primero.
	mainJSON := `{"schemaVersion": 1, "activeOverlayProfileId": "main", "cpuSampling": true, "hotkeys": {}, "launcherApps": {}, "launcherProfiles": []}`
	if err := os.WriteFile(path, []byte(mainJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)
	// sidecar después (más nuevo en mtime, pero más viejo semánticamente).
	sidecarJSON := `{"schemaVersion": 1, "activeOverlayProfileId": "sidecar", "cpuSampling": true, "hotkeys": {}, "launcherApps": {}, "launcherProfiles": []}`
	if err := os.WriteFile(sidecarPath, []byte(sidecarJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	// Ajustar mtime del main para que sea más nuevo.
	now := time.Now()
	os.Chtimes(path, now.Add(time.Hour), now.Add(time.Hour))
	os.Chtimes(sidecarPath, now, now)
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if svc.Settings().ActiveOverlayProfileID != "main" {
		t.Errorf("expected main, got %s", svc.Settings().ActiveOverlayProfileID)
	}
	if _, err := os.Stat(sidecarPath); !os.IsNotExist(err) {
		t.Errorf("stale sidecar should be removed")
	}
}

func TestSaveNilSettingsWithValidPathReturnsError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	_ = svc.Load()
	if err := svc.Save(nil); err == nil {
		t.Fatal("expected error for nil settings")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("file should not exist after Save(nil), got: %v", err)
	}
}

func TestLoadMigratesSchemaVersionAndAddsDeltaHotkey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	data := `{"schemaVersion": 2, "activeOverlayProfileId": "x", "cpuSampling": true, "hotkeys": {}, "launcherApps": {}, "launcherProfiles": []}`
	os.WriteFile(path, []byte(data), 0o644)
	svc := app.NewSettingsService(path, nil, nil)
	svc.Load()
	if svc.Settings().SchemaVersion != 4 {
		t.Errorf("expected SchemaVersion=4, got %d", svc.Settings().SchemaVersion)
	}
	if got := svc.Settings().Hotkeys["cycleDeltaReference"]; got != "ctrl+shift+d" {
		t.Errorf("cycleDeltaReference=%q want ctrl+shift+d", got)
	}
}

func TestLoadMigratesSettingsBeforePerformanceWithoutLosingExistingValues(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	legacy := `{"schemaVersion":3,"cpuSampling":false,"activeOverlayProfileId":"endurance","hotkeys":{},"launcherApps":{},"launcherProfiles":[]}`
	if err := os.WriteFile(path, []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}

	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	got := svc.Settings()
	if got.SchemaVersion != 4 || got.Performance.Mode != "level" || got.Performance.Level != 1 {
		t.Fatalf("migration result = %+v", got.Performance)
	}
	if got.CpuSampling || got.ActiveOverlayProfileID != "endurance" {
		t.Fatalf("legacy values changed: cpuSampling=%v profile=%q", got.CpuSampling, got.ActiveOverlayProfileID)
	}
}

func TestSaveCreatesMissingDirectory(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "subdir", "app-settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	s := app.DefaultAppSettings()
	if err := svc.Save(s); err != nil {
		t.Fatalf("save: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Errorf("file should exist: %v", err)
	}
}

func TestSettingsServiceSaveProducesValidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	svc := app.NewSettingsService(path, nil, nil)
	custom := app.DefaultAppSettings()
	custom.CpuSampling = false
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
	svc := app.NewSettingsService(path, nil, nil)
	_ = svc.Load()
	custom := app.DefaultAppSettings()
	custom.LauncherApps = map[string]app.LauncherAppEntry{
		"obs": {ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS", Category: app.AppCategoryStreaming, LaunchMethod: "executable", Detected: true, GradientFrom: "#302e31", GradientTo: "#0a0a0a"},
	}
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}
	loaded := app.NewSettingsService(path, nil, nil)
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
	svc := app.NewSettingsService(path, nil, nil)
	_ = svc.Load()
	custom := app.DefaultAppSettings()
	custom.LauncherProfiles = []app.LaunchProfile{
		{ID: "creator", Name: "Creador de Contenido", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}, {AppID: "obs", Delay: 2}}},
	}
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}
	loaded := app.NewSettingsService(path, nil, nil)
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

func TestLauncherPoliciesMigrateLegacyProfilesToSafeDefaults(t *testing.T) {
	s := app.DefaultAppSettings()
	s.LauncherProfiles = []app.LaunchProfile{{ID: "legacy", Name: "Legacy", Steps: []app.LaunchStep{{AppID: "lmu"}}}}
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":1,"launcherProfiles":[{"id":"legacy","name":"Legacy","steps":[{"appId":"lmu"}]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	profiles := svc.GetLauncherProfiles()
	if len(profiles) != 1 || profiles[0].Policy == nil {
		t.Fatalf("legacy profile was lost or policy was not migrated: %+v", profiles)
	}
	if profiles[0].Policy.AlreadyRunning != app.AlreadyRunningAsk || profiles[0].Policy.Failure != app.FailureAsk || profiles[0].Policy.MaxRetries != 0 {
		t.Fatalf("unexpected migrated policy: %+v", profiles[0].Policy)
	}
}

func TestDefaultAppSettingsHasCurrentSchemaVersion(t *testing.T) {
	s := app.DefaultAppSettings()
	if s.SchemaVersion != 4 {
		t.Fatalf("expected SchemaVersion=4, got %d", s.SchemaVersion)
	}
}

func TestSaveIsAtomic(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	_ = svc.Load()
	s := app.DefaultAppSettings()
	if err := svc.Save(s); err != nil {
		t.Fatalf("save: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Errorf("main should exist: %v", err)
	}
	s.ActiveOverlayProfileID = "relative"
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
	svc := app.NewSettingsService(path, nil, nil)
	_ = svc.Load()

	// Block the destination with a directory so the rename cannot land. This
	// used to block the ".tmp" path instead, which stopped being a lock once
	// every write got its own temp name.
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("mkdir settings dir: %v", err)
	}

	s := app.DefaultAppSettings()
	err := svc.Save(s)
	if err == nil {
		t.Fatal("expected error when the destination is blocked by a directory")
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
		"activeOverlayProfileId": "self",
		"cpuSampling": true,
		"hotkeys": {}
	}`
	if err := os.WriteFile(path, []byte(legacy), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if svc.Settings().SchemaVersion != 4 {
		t.Errorf("expected SchemaVersion=4 after migration, got %d", svc.Settings().SchemaVersion)
	}
	if got := svc.Settings().Performance; got.Mode != "level" || got.Level != 1 {
		t.Errorf("expected migrated performance level 1, got %+v", got)
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
	if err := os.WriteFile(bakPath, []byte(`{"schemaVersion": 1, "activeOverlayProfileId": "self", "cpuSampling": true, "hotkeys": {}, "launcherApps": {}, "launcherProfiles": []}`), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if svc.Settings().ActiveOverlayProfileID != "self" {
		t.Errorf("expected ActiveOverlayProfileID=self from .bak, got %s", svc.Settings().ActiveOverlayProfileID)
	}
}

func TestLoadFallsBackToDefaultsOnTotalCorruption(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	bakPath := path + ".bak"
	os.WriteFile(path, []byte("garbage"), 0o644)
	os.WriteFile(bakPath, []byte("also garbage"), 0o644)
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load should not panic: %v", err)
	}
	if svc.Settings().SchemaVersion != 4 {
		t.Errorf("expected defaults with SchemaVersion=4")
	}
	if svc.Settings().LauncherProfiles == nil {
		t.Error("expected default profiles")
	}
}

func TestSidecarAppliedOnStartup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	sidecarPath := path + ".failed"
	if err := os.WriteFile(sidecarPath, []byte(`{"schemaVersion": 1, "activeOverlayProfileId": "absolute", "cpuSampling": true, "hotkeys": {}, "launcherApps": {}, "launcherProfiles": [{"id":"x","name":"X","steps":[]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	if svc.Settings().ActiveOverlayProfileID != "absolute" {
		t.Errorf("expected sidecar applied, got %s", svc.Settings().ActiveOverlayProfileID)
	}
	if len(svc.Settings().LauncherProfiles) != 1 {
		t.Errorf("expected 1 profile from sidecar")
	}
	if _, err := os.Stat(sidecarPath); !os.IsNotExist(err) {
		t.Errorf("sidecar should be removed after applied")
	}
}

func TestUpdateLauncherAppArgs(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}

	// Seed an app
	custom := app.DefaultAppSettings()
	custom.LauncherApps = map[string]app.LauncherAppEntry{
		"obs": {ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS", Category: app.AppCategoryStreaming, LaunchMethod: "executable", Detected: true, GradientFrom: "#302e31", GradientTo: "#0a0a0a"},
	}
	if err := svc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}

	// Reload to get a clean service
	svc2 := app.NewSettingsService(path, nil, nil)
	if err := svc2.Load(); err != nil {
		t.Fatalf("reload: %v", err)
	}

	// Update args
	if err := svc2.UpdateLauncherAppArgs("obs", "--start --profile x"); err != nil {
		t.Fatalf("UpdateLauncherAppArgs: %v", err)
	}

	// Verify persistence
	loaded := app.NewSettingsService(path, nil, nil)
	if err := loaded.Load(); err != nil {
		t.Fatalf("final load: %v", err)
	}
	entry, ok := loaded.Settings().LauncherApps["obs"]
	if !ok {
		t.Fatal("obs app missing after update")
	}
	if entry.Args != "--start --profile x" {
		t.Errorf("expected args updated, got %q", entry.Args)
	}
}

func TestUpdateLauncherAppArgsReturnsErrorOnUnknownApp(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}

	err := svc.UpdateLauncherAppArgs("ghost", "args")
	if err != app.ErrAppNotFound {
		t.Fatalf("expected ErrAppNotFound, got %v", err)
	}
}

func TestUpdateLauncherAppArgsReturnsErrorOnNilSettings(t *testing.T) {
	svc := app.NewSettingsService("", nil, nil)
	err := svc.UpdateLauncherAppArgs("obs", "args")
	if err != app.ErrSettingsNotLoaded {
		t.Fatalf("expected ErrSettingsNotLoaded, got %v", err)
	}
}

func TestConcurrentSavesDontCorruptFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	_ = svc.Load()

	const N = 20
	var wg sync.WaitGroup
	errs := make(chan error, N*2)
	for i := 0; i < N; i++ {
		wg.Add(2)
		go func(i int) {
			defer wg.Done()
			s := app.DefaultAppSettings()
			s.LauncherApps = map[string]app.LauncherAppEntry{
				"k": {ID: "k", DisplayName: "App" + string(rune('A'+i%26)), Abbreviation: "K", Category: app.AppCategoryUtility, LaunchMethod: "executable", Detected: true, GradientFrom: "#000", GradientTo: "#fff"},
			}
			errs <- svc.Save(s)
		}(i)
		go func() {
			defer wg.Done()
			_ = svc.GetLauncherProfiles() // interleaving de lectura.
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("concurrent save: %v", err)
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var s app.AppSettings
	if err := json.Unmarshal(data, &s); err != nil {
		t.Errorf("final file must be valid JSON: %v", err)
	}
	if len(s.LauncherApps) != 1 {
		t.Errorf("expected 1 app, got %d", len(s.LauncherApps))
	}
}

func TestSettingsReadAPIsReturnDeepCopies(t *testing.T) {
	launchedAt := time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)
	initial := app.DefaultAppSettings()
	initial.SchemaVersion = 1
	initial.Hotkeys = map[string]string{"toggleOverlay": "ctrl+shift+v"}
	initial.LauncherApps = map[string]app.LauncherAppEntry{
		"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate"},
	}
	initial.LauncherProfiles = []app.LaunchProfile{{
		ID: "race", Policy: &app.LaunchPolicy{MaxRetries: 1},
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 1}}, LastLaunchedAt: &launchedAt,
	}}
	path := filepath.Join(t.TempDir(), "settings.json")
	service := app.NewSettingsService(path, nil, nil)
	if err := service.Save(initial); err != nil {
		t.Fatal(err)
	}
	launchedAt = launchedAt.Add(24 * time.Hour)
	if got := service.Settings().LauncherProfiles[0].LastLaunchedAt; got == nil ||
		!got.Equal(time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)) {
		t.Fatalf("saved settings retained input timestamp alias: %v", got)
	}

	snapshot := service.Settings()
	snapshot.Hotkeys["toggleOverlay"] = "mutated"
	snapshot.LauncherApps["lmu"] = app.LauncherAppEntry{ID: "changed"}
	snapshot.LauncherProfiles[0].Steps[0].Delay = 99
	snapshot.LauncherProfiles[0].Policy.MaxRetries = 3
	*snapshot.LauncherProfiles[0].LastLaunchedAt = snapshot.LauncherProfiles[0].LastLaunchedAt.Add(48 * time.Hour)

	apps := service.GetLauncherApps()
	delete(apps, "lmu")
	profiles := service.GetLauncherProfiles()
	profiles[0].Steps[0].Delay = 77
	*profiles[0].LastLaunchedAt = profiles[0].LastLaunchedAt.Add(72 * time.Hour)

	current := service.Settings()
	if current.Hotkeys["toggleOverlay"] != "ctrl+shift+v" {
		t.Fatalf("hotkeys leaked mutation: %#v", current.Hotkeys)
	}
	if current.LauncherApps["lmu"].ID != "lmu" || len(service.GetLauncherApps()) != 1 {
		t.Fatalf("launcher apps leaked mutation: %#v", current.LauncherApps)
	}
	if current.LauncherProfiles[0].Steps[0].Delay != 1 ||
		current.LauncherProfiles[0].Policy.MaxRetries != 1 {
		t.Fatalf("launcher profiles leaked mutation: %#v", current.LauncherProfiles)
	}
	if current.LauncherProfiles[0].LastLaunchedAt == nil ||
		!current.LauncherProfiles[0].LastLaunchedAt.Equal(time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)) {
		t.Fatalf("launcher timestamp leaked mutation: %v", current.LauncherProfiles[0].LastLaunchedAt)
	}
}

// Notification preferences are stored as opt-outs so the zero value is the
// shipping default. A file written before the field existed must therefore load
// with the banner and the toasts on, and system notifications off.
func TestSettingsNotificationDefaultsSurviveAnOlderFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":2,"cpuSampling":true}`), 0o644); err != nil {
		t.Fatalf("seed settings: %v", err)
	}

	svc := app.NewSettingsService(path, &spyEmitter{}, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	got := svc.Snapshot().Notifications
	if got.UpdatesMuted || got.LauncherMuted {
		t.Fatalf("an older file must keep in-app alerts on, got %+v", got)
	}
	if got.SystemEnabled {
		t.Fatal("desktop notifications must stay off until the platform grants permission")
	}
}

func TestSettingsNotificationChoicesRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	svc := app.NewSettingsService(path, &spyEmitter{}, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	next := *svc.Snapshot()
	next.Notifications = app.NotificationSettings{UpdatesMuted: true, SystemEnabled: true}
	if err := svc.Save(&next); err != nil {
		t.Fatalf("Save: %v", err)
	}

	reloaded := app.NewSettingsService(path, &spyEmitter{}, nil)
	if err := reloaded.Load(); err != nil {
		t.Fatalf("reload: %v", err)
	}
	got := reloaded.Snapshot().Notifications
	if !got.UpdatesMuted || got.LauncherMuted || !got.SystemEnabled {
		t.Fatalf("round trip = %+v, want updates muted and desktop enabled", got)
	}
}

// applyLoaded rebuilds AppSettings field by field, so a field added to the
// struct and forgotten there is read from disk and then silently dropped --
// which is exactly how notifications were lost the first time. This walks the
// struct with reflection, gives every field a non-zero value, saves, reloads
// and compares, so the next forgotten field fails here instead of in the app.
func TestApplyLoadedKeepsEveryPersistedField(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")

	populated := app.DefaultAppSettings()
	value := reflect.ValueOf(populated).Elem()
	for i := 0; i < value.NumField(); i++ {
		field := value.Field(i)
		name := value.Type().Field(i).Name
		if name == "SchemaVersion" {
			// Owned by the migration, not by the user.
			continue
		}
		fill(t, field, name)
	}

	svc := app.NewSettingsService(path, &spyEmitter{}, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := svc.Save(populated); err != nil {
		t.Fatalf("Save: %v", err)
	}

	reloaded := app.NewSettingsService(path, &spyEmitter{}, nil)
	if err := reloaded.Load(); err != nil {
		t.Fatalf("reload: %v", err)
	}

	got := reflect.ValueOf(reloaded.Snapshot()).Elem()
	for i := 0; i < value.NumField(); i++ {
		name := value.Type().Field(i).Name
		if name == "SchemaVersion" {
			continue
		}
		if got.Field(i).IsZero() {
			t.Errorf(
				"%s survived neither the save nor the load; it is probably missing from applyLoaded",
				name,
			)
		}
	}
}

// fill gives a field a value distinguishable from its zero value.
func fill(t *testing.T, field reflect.Value, name string) {
	t.Helper()
	switch field.Kind() {
	case reflect.Bool:
		field.SetBool(true)
	case reflect.String:
		field.SetString("filled")
	case reflect.Int, reflect.Int64:
		field.SetInt(1)
	case reflect.Uint, reflect.Uint32, reflect.Uint64:
		field.SetUint(1)
	case reflect.Map:
		filled := reflect.MakeMap(field.Type())
		key := reflect.New(field.Type().Key()).Elem()
		fill(t, key, name+".key")
		item := reflect.New(field.Type().Elem()).Elem()
		fill(t, item, name+".value")
		filled.SetMapIndex(key, item)
		field.Set(filled)
	case reflect.Slice:
		if field.Type() == reflect.TypeOf(json.RawMessage{}) {
			field.SetBytes([]byte(`20`))
			return
		}
		item := reflect.New(field.Type().Elem()).Elem()
		fill(t, item, name+"[0]")
		field.Set(reflect.Append(reflect.MakeSlice(field.Type(), 0, 1), item))
	case reflect.Ptr:
		field.Set(reflect.New(field.Type().Elem()))
		fill(t, field.Elem(), name+".*")
	case reflect.Struct:
		if field.Type() == reflect.TypeOf(time.Time{}) {
			field.Set(reflect.ValueOf(time.Unix(1, 0).UTC()))
			return
		}
		for i := 0; i < field.NumField(); i++ {
			fill(t, field.Field(i), name+"."+field.Type().Field(i).Name)
		}
	default:
		t.Fatalf("%s has kind %s, which this test does not know how to fill", name, field.Kind())
	}
}
