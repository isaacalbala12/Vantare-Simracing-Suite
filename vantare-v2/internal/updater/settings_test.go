package updater

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadSettingsMissingReturnsDefault(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	s, err := LoadSettings(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Channel != ChannelStable {
		t.Fatalf("channel=%s, want stable", s.Channel)
	}
}

func TestSaveAndLoadSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	want := &Settings{Channel: ChannelNightly, IgnoreVersion: "v0.1.0"}
	if err := SaveSettings(path, want); err != nil {
		t.Fatalf("save error: %v", err)
	}
	got, err := LoadSettings(path)
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	if got.Channel != want.Channel || got.IgnoreVersion != want.IgnoreVersion {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestLoadSettingsRetiresAmbiguousPrereleaseChannel(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"channel":"prerelease"}`), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := LoadSettings(path)
	if err != nil {
		t.Fatal(err)
	}
	if s.Channel != ChannelStable {
		t.Fatalf("channel=%s, want fail-closed stable", s.Channel)
	}
}

func TestLoadSettingsEmptyChannelDefaultsToStable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"ignoreVersion":"x"}`), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := LoadSettings(path)
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	if s.Channel != ChannelStable {
		t.Fatalf("channel=%s, want stable", s.Channel)
	}
}
