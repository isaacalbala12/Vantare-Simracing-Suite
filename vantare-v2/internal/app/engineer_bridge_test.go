package app

import (
	"path/filepath"
	"testing"

	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
)

func TestEngineerBridgePersistsAcceptedServiceStatus(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app-settings.json")
	settings := NewSettingsService(path, nil, nil)
	if err := settings.Load(); err != nil {
		t.Fatal(err)
	}
	svc := engineerservice.NewEngineerService(nil)
	if err := svc.SetEnabled(false); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetSensitivity("aggressive"); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetOutputMode("fuel", "visual"); err != nil {
		t.Fatal(err)
	}
	svc.SetSubtitlesEnabled(false)

	bridge := NewEngineerBridge(nil, nil, svc)
	bridge.SetSettingsService(settings)
	bridge.persistSettings()

	reloaded := NewSettingsService(path, nil, nil)
	if err := reloaded.Load(); err != nil {
		t.Fatal(err)
	}
	got := reloaded.EngineerSettings()
	if got.Enabled || got.Sensitivity != "aggressive" || got.OutputModes["fuel"] != "visual" || got.SubtitlesEnabled {
		t.Fatalf("persisted Engineer status = %+v", got)
	}
}

// ISA-928: the persisted subtitle flag is the user's configured preference.
// Status().SubtitlesEnabled is the effective value after the performance
// visual gate (levels 4-5) and must never be written to disk.
func TestEngineerBridgePersistsSubtitlePreferenceNotEffectiveState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app-settings.json")
	settings := NewSettingsService(path, nil, nil)
	if err := settings.Load(); err != nil {
		t.Fatal(err)
	}
	svc := engineerservice.NewEngineerService(nil)
	svc.SetSubtitlesEnabled(true)
	svc.SetVisualPresentationEnabled(false)

	if svc.Status().SubtitlesEnabled {
		t.Fatal("effective subtitles should be gated off by the visual policy")
	}
	bridge := NewEngineerBridge(nil, nil, svc)
	bridge.SetSettingsService(settings)
	bridge.persistSettings()

	reloaded := NewSettingsService(path, nil, nil)
	if err := reloaded.Load(); err != nil {
		t.Fatal(err)
	}
	if got := reloaded.EngineerSettings(); !got.SubtitlesEnabled {
		t.Fatalf("persisted subtitle preference = %+v, want enabled", got)
	}
}
