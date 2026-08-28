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
